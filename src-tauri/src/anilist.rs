use serde::{Deserialize, Serialize};
use serde_json::json;

/// AniList API endpoint
const ANILIST_API_URL: &str = "https://graphql.anilist.co";

/// Result of a simple title search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TitleSearchResult {
    pub english: Option<String>,
    pub romaji: Option<String>,
}

/// Result of progressive search with match info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressiveSearchResult {
    pub title: TitleSearchResult,
    pub matched_query: String, // The query that matched
    pub words_used: usize,     // How many words were used
    pub total_words: usize,    // Total words in original title
}

#[derive(Debug, Deserialize)]
struct SimpleTitleResponse {
    #[serde(rename = "Media")]
    media: Option<SimpleTitleMedia>,
}

#[derive(Debug, Deserialize)]
struct SimpleTitleMedia {
    title: TitleSearchResult,
}

/// Search anime title word-by-word, starting with 1 word
///
/// # Arguments
/// * `title` - The parsed anime title to search
///
/// # Returns
/// * `Result<Option<ProgressiveSearchResult>, String>` - Match result or error
///
/// # Strategy
/// 1. Split title into words
/// 2. Search with first word
/// 3. If found, return the result
/// 4. If not, add next word and try again
/// 5. Continue until match found or all words tried
pub async fn progressive_search_anime(
    title: &str,
) -> Result<Option<ProgressiveSearchResult>, String> {
    let words: Vec<&str> = title.split_whitespace().collect();

    if words.is_empty() {
        return Ok(None);
    }

    let total_words = words.len();

    // Try progressively more words
    for word_count in 1..=total_words {
        let search_query: String = words[..word_count].join(" ");
        let search_query_lower = search_query.to_lowercase();

        println!(
            "[AniList] Searching with {} word(s): \"{}\"",
            word_count, search_query
        );

        // Use the simple title query
        let graphql_query = r#"
            query Title($search: String) {
                Media(search: $search, type: ANIME) {
                    title {
                        english
                        romaji
                    }
                }
            }
        "#;

        let variables = json!({
            "search": search_query
        });

        let request_body = json!({
            "query": graphql_query,
            "variables": variables
        });

        let client = reqwest::Client::new();
        let response = client
            .post(ANILIST_API_URL)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        let anilist_response: AniListResponse<SimpleTitleResponse> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        if let Some(ref media) = anilist_response.data.media {
            // Validate: Check if returned title contains our search query
            let english_lower = media
                .title
                .english
                .as_ref()
                .map(|s| s.to_lowercase())
                .unwrap_or_default();
            let romaji_lower = media
                .title
                .romaji
                .as_ref()
                .map(|s| s.to_lowercase())
                .unwrap_or_default();

            // Check if either title contains ALL our search words
            let title_matches = search_query_lower
                .split_whitespace()
                .all(|word| english_lower.contains(word) || romaji_lower.contains(word));

            if title_matches {
                println!("[AniList] ✓ Valid match: {:?}", media.title);
                return Ok(Some(ProgressiveSearchResult {
                    title: media.title.clone(),
                    matched_query: search_query,
                    words_used: word_count,
                    total_words,
                }));
            } else {
                println!(
                    "[AniList] ✗ Rejected (title doesn't match query): {:?}",
                    media.title
                );
                // Continue with more words
            }
        }
    }

    println!(
        "[AniList] No valid match found after trying all {} words",
        total_words
    );
    Ok(None)
}

/// Represents an anime from AniList
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Anime {
    pub id: i32,
    pub title: AnimeTitle,
    #[serde(rename = "coverImage")]
    pub cover_image: CoverImage,
    pub episodes: Option<i32>,
    pub status: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeTitle {
    pub romaji: Option<String>,
    pub english: Option<String>,
    pub native: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverImage {
    pub large: Option<String>,
    pub medium: Option<String>,
}

/// Response wrapper for AniList GraphQL queries
#[derive(Debug, Deserialize)]
struct AniListResponse<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
struct MediaResponse {
    #[serde(rename = "Media")]
    media: Anime,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(rename = "Page")]
    page: PageData,
}

#[derive(Debug, Deserialize)]
struct PageData {
    media: Vec<Anime>,
}

/// Search for anime by title
///
/// # Arguments
/// * `query` - The search query (anime title)
/// * `limit` - Maximum number of results to return
///
/// # Returns
/// * `Result<Vec<Anime>, String>` - List of matching anime or error message
pub async fn search_anime(query: &str, limit: i32) -> Result<Vec<Anime>, String> {
    let graphql_query = r#"
        query ($search: String, $perPage: Int) {
            Page(perPage: $perPage) {
                media(search: $search, type: ANIME) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    coverImage {
                        large
                        medium
                    }
                    episodes
                    status
                    description
                }
            }
        }
    "#;

    let variables = json!({
        "search": query,
        "perPage": limit
    });

    let request_body = json!({
        "query": graphql_query,
        "variables": variables
    });

    // Make HTTP request
    let client = reqwest::Client::new();
    let response = client
        .post(ANILIST_API_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    // Parse response
    let anilist_response: AniListResponse<SearchResponse> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(anilist_response.data.page.media)
}

/// Get anime details by ID
///
/// # Arguments
/// * `id` - The AniList anime ID
///
/// # Returns
/// * `Result<Anime, String>` - Anime details or error message
pub async fn get_anime_by_id(id: i32) -> Result<Anime, String> {
    let graphql_query = r#"
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                id
                title {
                    romaji
                    english
                    native
                }
                coverImage {
                    large
                    medium
                }
                episodes
                status
                description
            }
        }
    "#;

    let variables = json!({
        "id": id
    });

    let request_body = json!({
        "query": graphql_query,
        "variables": variables
    });

    // Make HTTP request
    let client = reqwest::Client::new();
    let response = client
        .post(ANILIST_API_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    // Parse response
    let anilist_response: AniListResponse<MediaResponse> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(anilist_response.data.media)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i32,
    pub refresh_token: Option<String>,
}

/// Exchange Authorization Code for Access Token
pub async fn exchange_code_for_token(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let params = json!({
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "code": code
    });

    let response = client
        .post("https://anilist.co/api/v2/oauth/token")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&params)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", error_text));
    }

    let token_data: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(token_data)
}

/// Response from SaveMediaListEntry mutation
#[derive(Debug, Serialize, Deserialize)]
pub struct MediaListEntry {
    pub id: i32,
    pub progress: i32,
    pub status: String,
}

#[derive(Debug, Deserialize)]
struct SaveMediaListResponse {
    #[serde(rename = "SaveMediaListEntry")]
    save_media_list_entry: MediaListEntry,
}

/// Update anime progress on AniList (requires authentication)
///
/// # Arguments
/// * `access_token` - OAuth access token for authentication
/// * `media_id` - AniList media ID
/// * `progress` - Episode number to set as progress
/// * `status` - Optional status (CURRENT, COMPLETED, PAUSED, DROPPED, PLANNING, REPEATING)
///
/// # Returns
/// * `Result<MediaListEntry, String>` - Updated entry or error message
pub async fn update_media_progress(
    access_token: &str,
    media_id: i32,
    progress: i32,
    status: Option<&str>,
) -> Result<MediaListEntry, String> {
    let graphql_mutation = r#"
        mutation UpdateMediaProgress($mediaId: Int, $progress: Int, $status: MediaListStatus) {
            SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
                id
                progress
                status
            }
        }
    "#;

    let variables = if let Some(s) = status {
        json!({
            "mediaId": media_id,
            "progress": progress,
            "status": s
        })
    } else {
        json!({
            "mediaId": media_id,
            "progress": progress
        })
    };

    let request_body = json!({
        "query": graphql_mutation,
        "variables": variables
    });

    let client = reqwest::Client::new();
    let response = client
        .post(ANILIST_API_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Update failed: {}", error_text));
    }

    let anilist_response: AniListResponse<SaveMediaListResponse> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(anilist_response.data.save_media_list_entry)
}
