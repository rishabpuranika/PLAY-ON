// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Import the media_player module
mod media_player;
// Import the anilist module
mod anilist;
// Import file system module
mod file_system;
// Import title parser module
mod title_parser;
// Import CBZ reader module
mod cbz_reader;
// Import downloader module
mod downloader;
// Import MyAnimeList module
mod backup;
mod download;
mod myanimelist;
mod storage_prefs;

use download::manager::DownloadManager;
use download::provider::DownloadRequest;
use std::sync::Arc;
use std::sync::Mutex;
use storage_prefs::StorageManager;
use tokio::sync::Mutex as AsyncMutex;

use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{Emitter, Manager};

pub struct AppState {
    storage_manager: Arc<AsyncMutex<StorageManager>>,
    download_manager: DownloadManager,
}

/// Tauri command to search for anime on AniList
#[tauri::command]
async fn search_anime_command(query: String, limit: Option<i32>) -> Result<String, String> {
    let results = anilist::search_anime(&query, limit.unwrap_or(10)).await?;
    serde_json::to_string(&results).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri command to get anime details by ID
#[tauri::command]
async fn get_anime_by_id_command(id: i32) -> Result<String, String> {
    let anime = anilist::get_anime_by_id(id).await?;
    serde_json::to_string(&anime).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri command to match anime from window title
/// (Desktop Only logic mocked for Mobile)
#[tauri::command]
async fn match_anime_from_window_command() -> Result<String, String> {
    Ok("null".to_string())
}

/// Tauri command to get the currently active window title
#[tauri::command]
fn get_active_window() -> String {
    "Mobile App".to_string()
}

/// Tauri command to get active media player window
#[tauri::command]
fn get_active_media_window() -> String {
    "No media playing".to_string()
}

#[tauri::command]
async fn exchange_login_code(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
) -> Result<String, String> {
    let token_data =
        anilist::exchange_code_for_token(code, client_id, client_secret, redirect_uri).await?;
    serde_json::to_string(&token_data).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri command to parse a window title and extract anime info
#[tauri::command]
fn parse_window_title_command(window_title: String) -> String {
    let parsed = title_parser::parse_window_title(&window_title);
    serde_json::to_string(&parsed).unwrap_or_else(|_| "null".to_string())
}

/// Simple in-memory cache for AniList lookups
use std::collections::HashMap;
use std::time::{Duration, Instant};

struct CacheEntry {
    anime: Option<anilist::Anime>,
    timestamp: Instant,
}

lazy_static::lazy_static! {
  static ref ANILIST_CACHE: std::sync::Mutex<HashMap<String, CacheEntry>> = Mutex::new(HashMap::new());
}

const CACHE_DURATION: Duration = Duration::from_secs(300); // 5 minutes

fn get_cached_anime(title: &str) -> Option<Option<anilist::Anime>> {
    let cache = ANILIST_CACHE.lock().ok()?;
    if let Some(entry) = cache.get(title) {
        if entry.timestamp.elapsed() < CACHE_DURATION {
            return Some(entry.anime.clone());
        }
    }
    None
}

fn set_cached_anime(title: String, anime: Option<anilist::Anime>) {
    if let Ok(mut cache) = ANILIST_CACHE.lock() {
        cache.insert(
            title,
            CacheEntry {
                anime,
                timestamp: Instant::now(),
            },
        );
    }
}

/// Tauri command to detect anime from the current media player window
#[tauri::command]
async fn detect_anime_command() -> Result<String, String> {
    use serde_json::json;
    Ok(json!({
        "status": "not_supported_on_mobile",
        "window": "Mobile App"
    })
    .to_string())
}

/// Tauri command to update anime progress on AniList
#[tauri::command]
async fn update_anime_progress_command(
    access_token: String,
    media_id: i32,
    progress: i32,
    status: Option<String>,
) -> Result<String, String> {
    let status_ref = status.as_deref();
    let entry =
        anilist::update_media_progress(&access_token, media_id, progress, status_ref).await?;
    serde_json::to_string(&entry).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri command to search anime progressively
#[tauri::command]
async fn progressive_search_command(title: String) -> Result<String, String> {
    let result = anilist::progressive_search_anime(&title).await?;
    serde_json::to_string(&result).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri command to download a chapter as CBZ
#[tauri::command]
async fn download_chapter_command(
    chapter_title: String,
    manga_title: String,
    urls: Vec<String>,
    download_dir: String,
) -> Result<String, String> {
    println!(
        "[Downloader] Received command: {} - {} ({} pages)",
        manga_title,
        chapter_title,
        urls.len()
    );
    println!("[Downloader] Download dir: {}", download_dir);

    let result =
        downloader::download_chapter_to_cbz(chapter_title, manga_title, urls, download_dir).await;

    match &result {
        Ok(path) => println!("[Downloader] Success! CBZ saved to: {}", path),
        Err(e) => println!("[Downloader] Error: {}", e),
    }

    result
}

/// Tauri command to delete a downloaded chapter
#[tauri::command]
async fn delete_chapter_command(
    chapter_title: String,
    manga_title: String,
    download_dir: String,
) -> Result<String, String> {
    println!(
        "[Delete] Received command: {} - {}",
        manga_title, chapter_title
    );

    // Sanitize names (simple replacement for now, matching common logic)
    // In a real app we should reuse the exact sanitization logic used during download
    // For now we trust the path construction or try to match it.
    // Ideally, we should pass the exact path, but the frontend constructs it dynamically too.

    // NOTE: The download logic usually sanitizes via `sanitize_filename` crate.
    // We should do the same here if possible, but we might not have it exposed easily in this file?
    // Let's rely on standard path joining which should work if the input strings are already "safe" or if we use string manipulation.
    // The Frontend currently sends: safeTitle, safeChapter.

    // Wait, the frontend sends "Manga Title" and "Chapter X".
    // The backend `download_chapter_command` calls `downloader::download_chapter_to_cbz`.
    // Let's check `downloader.rs` to see how it constructs path.
    // It likely uses `sanitize_filename`.

    // To match exactly, we should ideally simply take the full path from frontend if possible?
    // But Android file paths can be tricky.

    // Let's try to construct it here.
    use std::path::PathBuf;

    let path = PathBuf::from(&download_dir)
        .join("Manga")
        .join(&manga_title)
        .join(&chapter_title);

    // Try to remove
    if path.exists() {
        if path.is_dir() {
            std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        println!("[Delete] Deleted: {:?}", path);
        Ok("Deleted".to_string())
    } else {
        // Try adding .cbz extension if it doesn't exist as folder
        let cbz_path = path.with_extension("cbz");
        if cbz_path.exists() {
            std::fs::remove_file(&cbz_path).map_err(|e| e.to_string())?;
            println!("[Delete] Deleted CBZ: {:?}", cbz_path);
            Ok("Deleted CBZ".to_string())
        } else {
            // Try ignoring sanitization mismatch?
            // Since we can't easily sanitize here without importing the crate if not already there.
            // Let's assume frontend sends correct path info or we iterate?

            // Simplest fallback: Return error so we can debug path
            Err(format!("Path not found: {:?} (and .cbz)", path))
        }
    }
}

lazy_static::lazy_static! {
    static ref IMAGE_CACHE: std::sync::Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

/// Tauri command to download an image and return local file path
#[tauri::command]
async fn download_image_for_notification(url: String) -> Result<String, String> {
    use std::io::Write;
    use std::path::PathBuf;

    // Check cache first
    {
        let cache = IMAGE_CACHE.lock().map_err(|_| "Cache lock error")?;
        if let Some(path) = cache.get(&url) {
            if std::path::Path::new(path).exists() {
                println!("[ImageCache] Cache hit: {}", url);
                return Ok(path.clone());
            }
        }
    }

    println!("[ImageCache] Downloading: {}", url);

    // Create cache directory in temp
    let cache_dir = std::env::temp_dir().join("playon_image_cache");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    // Generate filename from URL hash
    let hash = format!("{:x}", md5_hash(&url));
    let extension = url.split('.').last().unwrap_or("jpg");
    let filename = format!("{}.{}", hash, extension);
    let file_path: PathBuf = cache_dir.join(&filename);

    // Download image
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Save to file
    let mut file =
        std::fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let path_str = file_path.to_string_lossy().to_string();

    // Update cache
    {
        let mut cache = IMAGE_CACHE.lock().map_err(|_| "Cache lock error")?;
        cache.insert(url, path_str.clone());
    }

    println!("[ImageCache] Saved to: {}", path_str);
    Ok(path_str)
}

/// Simple hash function for cache keys
fn md5_hash(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// Tauri command to hide the main window (minimize to tray)
#[tauri::command]
async fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(_window) = app.get_webview_window("main") {
        #[cfg(mobile)]
        {
            // Mobile cannot hide the window in the desktop sense,
            // usually this means "minimize to background" which is handled by OS,
            // or just ignored.
            println!("[Mobile] hide_window called - ignoring on mobile");
        }
    }
    Ok(())
}

// ============================================================================
// MYANIMELIST COMMANDS
// ============================================================================

/// Generate PKCE code verifier and challenge for MAL OAuth
#[tauri::command]
fn mal_generate_pkce() -> (String, String) {
    let verifier = myanimelist::generate_code_verifier();
    let challenge = myanimelist::generate_code_challenge(&verifier);
    (verifier, challenge)
}

/// Complete MAL OAuth flow
#[tauri::command]
async fn mal_start_oauth_flow(_client_id: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        // Mobile doesn't support local server OAuth flow
        return Err(
            "MAL OAuth local server flow not supported on mobile. Please use browser-based OAuth."
                .to_string(),
        );
    }

    #[cfg(not(target_os = "android"))]
    {
        // Generate PKCE
        let verifier = myanimelist::generate_code_verifier();
        let challenge = myanimelist::generate_code_challenge(&verifier);

        // Use a fixed port for the callback server
        let port: u16 = 17563;
        let redirect_uri = format!("http://localhost:{}", port);

        // Build auth URL
        let auth_url = format!(
            "https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id={}&code_challenge={}&code_challenge_method=plain&redirect_uri={}",
            urlencoding::encode(&client_id),
            urlencoding::encode(&challenge),
            urlencoding::encode(&redirect_uri)
        );

        println!("[MAL] Starting OAuth flow...");
        println!("[MAL] Redirect URI: {}", redirect_uri);

        // Start the callback server in a separate task
        let server_handle =
            tokio::spawn(async move { myanimelist::start_oauth_callback_server(port).await });

        // Open browser - properly escape URL for each platform
        println!("[MAL] Opening browser: {}", auth_url);

        // Desktop: open default browser
        if let Err(e) = open::that(&auth_url) {
            println!("Failed to open browser: {}", e);
            // Fallback or error? Continuing locally...
        }

        // Wait for the code from the callback server
        // Adding timeout as good practice implicit in user request
        use std::time::Duration;
        use tokio::time::timeout;

        let code_res = timeout(Duration::from_secs(300), server_handle)
            .await
            .map_err(|_| "OAuth timeout after 5 minutes".to_string())?
            .map_err(|e| format!("Server task error: {}", e))?
            .map_err(|e| format!("OAuth callback error: {}", e))?;

        println!("[MAL] Received authorization code, exchanging for tokens...");

        // Exchange code for tokens
        let token_data = myanimelist::exchange_code_for_token(
            code_res,
            client_id,
            verifier,
            format!("http://localhost:{}", port),
        )
        .await?;

        serde_json::to_string(&token_data).map_err(|e| format!("Serialization error: {}", e))
    }
}

/// Exchange authorization code for MAL tokens using PKCE
#[tauri::command]
async fn mal_exchange_code(
    code: String,
    client_id: String,
    code_verifier: String,
    redirect_uri: String,
) -> Result<String, String> {
    let token_data =
        myanimelist::exchange_code_for_token(code, client_id, code_verifier, redirect_uri).await?;
    serde_json::to_string(&token_data).map_err(|e| format!("Serialization error: {}", e))
}

/// Refresh MAL access token
#[tauri::command]
async fn mal_refresh_token(refresh_token: String, client_id: String) -> Result<String, String> {
    let token_data = myanimelist::refresh_token(refresh_token, client_id).await?;
    serde_json::to_string(&token_data).map_err(|e| format!("Serialization error: {}", e))
}

/// Get MAL user profile
#[tauri::command]
async fn mal_get_user(access_token: String) -> Result<String, String> {
    let user = myanimelist::get_user_info(&access_token).await?;
    serde_json::to_string(&user).map_err(|e| format!("Serialization error: {}", e))
}

/// Search anime on MAL
#[tauri::command]
async fn mal_search_anime(
    access_token: String,
    query: String,
    limit: Option<i32>,
) -> Result<String, String> {
    let results = myanimelist::search_anime(&access_token, &query, limit.unwrap_or(10)).await?;
    serde_json::to_string(&results).map_err(|e| format!("Serialization error: {}", e))
}

/// Search manga on MAL
#[tauri::command]
async fn mal_search_manga(
    access_token: String,
    query: String,
    limit: Option<i32>,
) -> Result<String, String> {
    let results = myanimelist::search_manga(&access_token, &query, limit.unwrap_or(10)).await?;
    serde_json::to_string(&results).map_err(|e| format!("Serialization error: {}", e))
}

/// Update anime progress on MAL
#[tauri::command]
async fn mal_update_anime_progress(
    access_token: String,
    anime_id: i64,
    episodes_watched: i32,
    status: Option<String>,
) -> Result<String, String> {
    let status_ref = status.as_deref();
    let result =
        myanimelist::update_anime_progress(&access_token, anime_id, episodes_watched, status_ref)
            .await?;
    serde_json::to_string(&result).map_err(|e| format!("Serialization error: {}", e))
}

/// Update manga progress on MAL
#[tauri::command]
async fn mal_update_manga_progress(
    access_token: String,
    manga_id: i64,
    chapters_read: i32,
    status: Option<String>,
) -> Result<String, String> {
    let status_ref = status.as_deref();
    let result =
        myanimelist::update_manga_progress(&access_token, manga_id, chapters_read, status_ref)
            .await?;
    serde_json::to_string(&result).map_err(|e| format!("Serialization error: {}", e))
}

/// Get user's anime list from MAL
#[tauri::command]
async fn mal_get_anime_list(
    access_token: String,
    status: Option<String>,
    limit: Option<i32>,
) -> Result<String, String> {
    let status_ref = status.as_deref();
    let results =
        myanimelist::get_anime_list(&access_token, status_ref, limit.unwrap_or(100)).await?;
    serde_json::to_string(&results).map_err(|e| format!("Serialization error: {}", e))
}

/// Get user's manga list from MAL
#[tauri::command]
async fn mal_get_manga_list(
    access_token: String,
    status: Option<String>,
    limit: Option<i32>,
) -> Result<String, String> {
    let status_ref = status.as_deref();
    let results =
        myanimelist::get_manga_list(&access_token, status_ref, limit.unwrap_or(100)).await?;
    serde_json::to_string(&results).map_err(|e| format!("Serialization error: {}", e))
}

/// Open a new browser window with the given URL
#[tauri::command]
async fn open_browser_window(
    app: tauri::AppHandle,
    url: String,
    _title: String,
) -> Result<String, String> {
    #[cfg(mobile)]
    {
        // On mobile, just open the URL in the system browser
        // using the opener plugin which is already registered
        // Or if we need a separate view, mobile usually pushes a new screen.
        // For simplicity, let's just open system browser for now or return error
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string())?;
        Ok("Opened in system browser".to_string())
    }
}

/// Proxy video stream requests to bypass CORS and inject headers
#[tauri::command]
async fn stream_proxy(
    url: String,
    headers: std::collections::HashMap<String, String>,
) -> Result<Vec<u8>, String> {
    let url_obj = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let host = url_obj.host_str().ok_or("No host in URL")?;

    let mut client_builder = reqwest::Client::builder();
    if let Some(ip) = resolve_host(host).await {
        let port = url_obj.port_or_known_default().unwrap_or(443);
        let addr = SocketAddr::new(ip, port);
        client_builder = client_builder.resolve(host, addr);
    }
    let client = client_builder.build().map_err(|e| e.to_string())?;

    let mut request = client.get(&url);

    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

lazy_static::lazy_static! {
   static ref DNS_CACHE: std::sync::Mutex<HashMap<String, IpAddr>> = Mutex::new(HashMap::new());
}

async fn resolve_host(host: &str) -> Option<IpAddr> {
    {
        let cache = DNS_CACHE.lock().unwrap();
        if let Some(ip) = cache.get(host) {
            return Some(*ip);
        }
    }

    println!("[DNS] Resolving {} via Google DoH...", host);
    let client = reqwest::Client::new();
    let url = format!("https://dns.google/resolve?name={}&type=A", host);

    if let Ok(res) = client.get(&url).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(answers) = json["Answer"].as_array() {
                for answer in answers {
                    if let Some(data) = answer["data"].as_str() {
                        if let Ok(ip) = IpAddr::from_str(data) {
                            println!("[DNS] Resolved {} -> {}", host, ip);
                            let mut cache = DNS_CACHE.lock().unwrap();
                            cache.insert(host.to_string(), ip);
                            return Some(ip);
                        }
                    }
                }
            }
        }
    }
    println!("[DNS] Failed to resolve {} via DoH", host);
    None
}

/// Generic proxy request command with DoH support
#[tauri::command]
async fn proxy_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let url_obj = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let host = url_obj.host_str().ok_or("No host in URL")?;

    let mut client_builder = reqwest::Client::builder();

    if let Some(ip) = resolve_host(host).await {
        let port = url_obj.port_or_known_default().unwrap_or(443);
        let addr = SocketAddr::new(ip, port);
        client_builder = client_builder.resolve(host, addr);
    }

    let client = client_builder.build().map_err(|e| e.to_string())?;

    let mut req_builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };

    for (k, v) in headers {
        req_builder = req_builder.header(&k, &v);
    }

    if let Some(b) = body {
        req_builder = req_builder.body(b);
    }

    let res = req_builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let res_headers: std::collections::HashMap<String, String> = res
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let text = res.text().await.map_err(|e| e.to_string())?;

    let response_data = serde_json::json!({
        "ok": status >= 200 && status < 300,
        "status": status,
        "headers": res_headers,
        "data": text
    });

    Ok(response_data.to_string())
}

#[tauri::command]
async fn pick_download_directory(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Mobile-only: Use fixed path
    let path_str = "/storage/emulated/0/PLAYON".to_string();
    let path = std::path::PathBuf::from(&path_str);

    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Save logic preserved from original to ensure functionality
    let mut manager = state.storage_manager.lock().await;
    manager.set_download_location(path_str.clone());
    manager.save_prefs()?;

    // Create directories
    let path = std::path::PathBuf::from(&path_str);
    let downloads_path = path.join("downloads");
    let local_path = path.join("local");
    let backup_path = path.join("backup");

    for dir in &[downloads_path, local_path, backup_path] {
        if !dir.exists() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Create .nomedia file
    let nomedia = path.join("downloads").join(".nomedia");
    if !nomedia.exists() {
        let _ = tokio::fs::write(&nomedia, "").await;
    }

    Ok(path_str)
}

#[tauri::command]
async fn get_download_location(
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let manager = state.storage_manager.lock().await;
    Ok(manager.get_download_location())
}

/// Manually set the download directory path (for Android where folder picker doesn't work)
#[tauri::command]
async fn set_download_directory(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    // Validate the path exists or can be created
    let path_buf = std::path::PathBuf::from(&path);

    if !path_buf.exists() {
        tokio::fs::create_dir_all(&path_buf)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Save to preferences
    let mut manager = state.storage_manager.lock().await;
    manager.set_download_location(path.clone());
    manager.save_prefs()?;

    // Create subdirectories
    let downloads_path = path_buf.join("downloads");
    let local_path = path_buf.join("local");
    let backup_path = path_buf.join("backup");

    for dir in &[downloads_path.clone(), local_path, backup_path] {
        if !dir.exists() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Create .nomedia file
    let nomedia = downloads_path.join(".nomedia");
    if !nomedia.exists() {
        let _ = tokio::fs::write(&nomedia, "").await;
    }

    Ok(path)
}

#[tauri::command]
async fn download_chapter(
    state: tauri::State<'_, AppState>,
    request: DownloadRequest,
) -> Result<String, String> {
    state.download_manager.queue_chapter(request).await?;
    Ok("queued".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init());

    builder
        .invoke_handler(tauri::generate_handler![
            get_active_window,
            get_active_media_window,
            search_anime_command,
            get_anime_by_id_command,
            match_anime_from_window_command,
            file_system::get_folder_contents,
            exchange_login_code,
            parse_window_title_command,
            detect_anime_command,
            update_anime_progress_command,
            progressive_search_command,
            download_image_for_notification,
            cbz_reader::get_cbz_info,
            cbz_reader::get_cbz_page,
            cbz_reader::get_cbz_page,
            cbz_reader::is_valid_cbz,
            backup::get_backup_config,
            backup::save_backup_config,
            backup::create_backup,
            backup::restore_backup,
            backup::list_backups,
            backup::export_backup_to_path,
            hide_window,
            // MAL commands
            mal_generate_pkce,
            mal_start_oauth_flow,
            mal_exchange_code,
            mal_refresh_token,
            mal_get_user,
            mal_search_anime,
            mal_search_manga,
            mal_update_anime_progress,
            mal_update_manga_progress,
            mal_get_anime_list,
            mal_get_manga_list,
            // Browser window command
            open_browser_window,
            proxy_request,
            stream_proxy,
            // Storage & Download
            pick_download_directory,
            get_download_location,
            set_download_directory,
            download_chapter,
            download_chapter_command,
            delete_chapter_command,
        ])
        .setup(|app| {
            // Initialize storage manager
            let storage_manager = StorageManager::new(app.handle().clone());

            // Initialize download manager
            let (download_manager, mut rx) = DownloadManager::new(storage_manager.clone());

            // Spawn event listener
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some((id, state)) = rx.recv().await {
                    let _ = handle.emit("download-progress", (id, state));
                }
            });

            app.manage(AppState {
                storage_manager: Arc::new(AsyncMutex::new(storage_manager)),
                download_manager,
            });

            // Deep link registration (moved here or kept? The original had a setup block. I need to merge them.)
            #[cfg(any(target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .register_uri_scheme_protocol("manga", |_app, request| {
            let url = request.uri().to_string();
            println!("[Protocol] Manga Handler called for: {}", url);

            // Format: manga://localhost/path/to/file.cbz/page.jpg
            // 1. Strip scheme and host
            let path_and_query = url.replace("manga://localhost/", "");

            // 2. Split into file path and page name
            let segments: Vec<&str> = path_and_query.split('/').collect();
            if segments.len() < 2 {
                return tauri::http::Response::builder()
                    .status(400)
                    .body(Vec::new())
                    .unwrap();
            }

            let encoded_path = segments[0];
            // The rest is the page name
            let encoded_page = segments[1..].join("/");

            let decoded_path = match urlencoding::decode(encoded_path) {
                Ok(p) => p.to_string(),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(400)
                        .body(Vec::new())
                        .unwrap()
                }
            };

            let decoded_page = match urlencoding::decode(&encoded_page) {
                Ok(p) => p.to_string(),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(400)
                        .body(Vec::new())
                        .unwrap()
                }
            };

            match cbz_reader::read_cbz_page_bytes(&decoded_path, &decoded_page) {
                Ok((bytes, mime)) => tauri::http::Response::builder()
                    .header("Content-Type", mime)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                Err(e) => {
                    eprintln!("Manga protocol error: {}", e);
                    tauri::http::Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap()
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
