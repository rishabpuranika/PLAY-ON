use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

/// Local chapter override status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterOverride {
    pub is_read: bool,
    pub toggled_at: i64, // Unix timestamp
    pub synced_to_anilist: bool,
}

/// Manga progress entry with sync boundary
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MangaProgressEntry {
    /// The highest chapter number synced to AniList
    pub anilist_synced_chapter: f64,
    /// Unix timestamp of last AniList sync
    pub anilist_last_sync: Option<i64>,
    /// Local overrides for individual chapters (chapter_id -> status)
    pub local_overrides: HashMap<String, ChapterOverride>,
}

/// Full manga progress library
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MangaProgressLibrary {
    /// manga_id -> progress entry
    pub entries: HashMap<String, MangaProgressEntry>,
}

/// Manager for manga progress storage
#[derive(Clone)]
pub struct MangaProgressManager {
    app_handle: AppHandle,
}

const PROGRESS_FILE: &str = "manga_progress.json";

impl MangaProgressManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Load the entire progress library from disk
    pub fn load_library(&self) -> MangaProgressLibrary {
        let config_dir = self
            .app_handle
            .path()
            .app_config_dir()
            .expect("Failed to get config dir");

        let path = config_dir.join(PROGRESS_FILE);

        if let Ok(contents) = std::fs::read_to_string(&path) {
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            MangaProgressLibrary::default()
        }
    }

    /// Save the entire progress library to disk
    pub fn save_library(&self, library: &MangaProgressLibrary) -> Result<(), String> {
        let config_dir = self
            .app_handle
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?;

        // Ensure config dir exists
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }

        let path = config_dir.join(PROGRESS_FILE);
        let contents = serde_json::to_string_pretty(library).map_err(|e| e.to_string())?;
        std::fs::write(path, contents).map_err(|e| e.to_string())
    }

    /// Get or create a manga progress entry
    pub fn get_entry(&self, manga_id: &str) -> MangaProgressEntry {
        let library = self.load_library();
        library.entries.get(manga_id).cloned().unwrap_or_default()
    }

    /// Update a manga progress entry
    pub fn update_entry(&self, manga_id: &str, entry: MangaProgressEntry) -> Result<(), String> {
        let mut library = self.load_library();
        library.entries.insert(manga_id.to_string(), entry);
        self.save_library(&library)
    }

    /// Toggle a single chapter's read status (local only)
    pub fn toggle_chapter(
        &self,
        manga_id: &str,
        chapter_id: &str,
        is_read: bool,
    ) -> Result<ChapterOverride, String> {
        let mut entry = self.get_entry(manga_id);

        let override_status = ChapterOverride {
            is_read,
            toggled_at: chrono::Utc::now().timestamp(),
            synced_to_anilist: false,
        };

        entry
            .local_overrides
            .insert(chapter_id.to_string(), override_status.clone());
        self.update_entry(manga_id, entry)?;

        Ok(override_status)
    }

    /// Bulk update chapters (local only)
    pub fn bulk_update_chapters(
        &self,
        manga_id: &str,
        chapter_ids: Vec<String>,
        is_read: bool,
    ) -> Result<usize, String> {
        let mut entry = self.get_entry(manga_id);
        let now = chrono::Utc::now().timestamp();
        let count = chapter_ids.len();

        for chapter_id in chapter_ids {
            entry.local_overrides.insert(
                chapter_id,
                ChapterOverride {
                    is_read,
                    toggled_at: now,
                    synced_to_anilist: false,
                },
            );
        }

        self.update_entry(manga_id, entry)?;
        Ok(count)
    }

    /// Get chapter read status (local override > AniList fallback)
    /// Returns: (is_read, is_local_override)
    pub fn get_chapter_status(
        &self,
        manga_id: &str,
        chapter_id: &str,
        chapter_number: f64,
    ) -> (bool, bool) {
        let entry = self.get_entry(manga_id);

        // Check local override first
        if let Some(override_status) = entry.local_overrides.get(chapter_id) {
            return (override_status.is_read, true);
        }

        // Fall back to AniList sync point
        let is_read = chapter_number <= entry.anilist_synced_chapter;
        (is_read, false)
    }

    /// Update AniList sync point (called after successful AniList API update)
    pub fn update_sync_point(&self, manga_id: &str, chapter_number: f64) -> Result<(), String> {
        let mut entry = self.get_entry(manga_id);

        // Only update if new chapter is higher
        if chapter_number > entry.anilist_synced_chapter {
            entry.anilist_synced_chapter = chapter_number;
            entry.anilist_last_sync = Some(chrono::Utc::now().timestamp());
            self.update_entry(manga_id, entry)?;
        }

        Ok(())
    }

    /// Initialize from AniList (set sync point, mark chapters as read up to that point)
    pub fn initialize_from_anilist(&self, manga_id: &str, progress: f64) -> Result<(), String> {
        let mut entry = self.get_entry(manga_id);

        entry.anilist_synced_chapter = progress;
        entry.anilist_last_sync = Some(chrono::Utc::now().timestamp());
        // Clear local overrides when syncing from AniList
        entry.local_overrides.clear();

        self.update_entry(manga_id, entry)
    }

    /// Clear all local overrides for a manga
    pub fn clear_local_overrides(&self, manga_id: &str) -> Result<(), String> {
        let mut entry = self.get_entry(manga_id);
        entry.local_overrides.clear();
        self.update_entry(manga_id, entry)
    }
}
