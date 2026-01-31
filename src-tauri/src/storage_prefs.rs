use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoragePreferences {
    pub download_location: Option<String>, // URI or path
    pub downloads_dir_name: String,
}

impl Default for StoragePreferences {
    fn default() -> Self {
        Self {
            download_location: None,
            downloads_dir_name: "downloads".to_string(),
        }
    }
}

#[derive(Clone)]
pub struct StorageManager {
    app_handle: AppHandle,
    prefs: StoragePreferences,
}

impl StorageManager {
    pub fn new(app_handle: AppHandle) -> Self {
        let prefs = Self::load_prefs(&app_handle);
        Self { app_handle, prefs }
    }

    fn load_prefs(app_handle: &AppHandle) -> StoragePreferences {
        // Load from app config dir
        let config_dir = app_handle
            .path()
            .app_config_dir()
            .expect("Failed to get config dir");

        let prefs_path = config_dir.join("storage_prefs.json");

        if let Ok(contents) = std::fs::read_to_string(&prefs_path) {
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            StoragePreferences::default()
        }
    }

    pub fn save_prefs(&self) -> Result<(), String> {
        let config_dir = self
            .app_handle
            .path()
            .app_config_dir()
            .map_err(|e| e.to_string())?;

        let prefs_path = config_dir.join("storage_prefs.json");
        let contents = serde_json::to_string_pretty(&self.prefs).map_err(|e| e.to_string())?;

        std::fs::write(prefs_path, contents).map_err(|e| e.to_string())
    }

    pub fn set_download_location(&mut self, location: String) {
        self.prefs.download_location = Some(location);
    }

    pub fn get_download_location(&self) -> Option<String> {
        self.prefs.download_location.clone()
    }

    /// Get the full downloads directory path
    pub async fn get_downloads_dir(&self) -> Result<PathBuf, String> {
        if let Some(location) = &self.prefs.download_location {
            let path = PathBuf::from(location);
            // User requested to put downloads in "Manga" folder
            // We force this name here to align with the "Manga" folder shown in UI
            let downloads = path.join("Manga");

            // Ensure directory exists
            if !downloads.exists() {
                tokio::fs::create_dir_all(&downloads)
                    .await
                    .map_err(|e| format!("Failed to create downloads dir: {}", e))?;
            }

            // Create .nomedia file to prevent gallery indexing (Mihon-style)
            let nomedia = downloads.join(".nomedia");
            if !nomedia.exists() {
                let _ = tokio::fs::write(&nomedia, "").await;
            }

            Ok(downloads)
        } else {
            Err("No download location set".to_string())
        }
    }

    /// Construct download path for a specific chapter (Mihon naming convention)
    pub fn get_chapter_download_path(
        &self,
        source_name: &str,
        series_title: &str,
        chapter_name: &str,
        chapter_url: &str, // Used for hash like Mihon
    ) -> Result<PathBuf, String> {
        let downloads_dir = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(self.get_downloads_dir())
        })?;

        // Sanitize names (Mihon replaces special chars with underscores)
        let source = sanitize_filename::sanitize(source_name);
        let series = sanitize_filename::sanitize(series_title);
        let chapter = sanitize_filename::sanitize(chapter_name);

        // Add hash suffix like Mihon: "Chapter 1 (a1b2c3).cbz"
        let hash = format!("{:x}", md5::compute(chapter_url));
        let short_hash = &hash[..6];
        let chapter_filename = format!("{} ({}).cbz", chapter, short_hash);

        Ok(downloads_dir
            .join(source)
            .join(series)
            .join(chapter_filename))
    }
}
