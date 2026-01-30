use crate::storage_prefs::StorageManager;
use sanitize_filename::sanitize;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub id: String,
    pub chapter_url: String,
    pub source_name: String,
    pub series_title: String,
    pub chapter_name: String,
    pub image_urls: Vec<String>, // For manga pages
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadState {
    Queued,
    Downloading { progress: f32 },
    Completed,
    Error(String),
}

#[derive(Clone)]
pub struct DownloadProvider {
    pub storage_manager: StorageManager,
}

impl DownloadProvider {
    pub fn new(storage_manager: StorageManager) -> Self {
        Self { storage_manager }
    }

    /// Check if chapter is already downloaded (Mihon-style lookup)
    pub async fn is_chapter_downloaded(&self, request: &DownloadRequest) -> Result<bool, String> {
        let path = self.storage_manager.get_chapter_download_path(
            &request.source_name,
            &request.series_title,
            &request.chapter_name,
            &request.chapter_url,
        )?;

        Ok(path.exists())
    }

    pub async fn get_chapter_dir(&self, request: &DownloadRequest) -> Result<PathBuf, String> {
        self.storage_manager.get_chapter_download_path(
            &request.source_name,
            &request.series_title,
            &request.chapter_name,
            &request.chapter_url,
        )
    }

    /// Get valid chapter directory names (Mihon checks multiple possible names)
    pub fn get_valid_chapter_names(chapter_name: &str, chapter_url: &str) -> Vec<String> {
        let base = sanitize(chapter_name);
        let hash = format!("{:x}", md5::compute(chapter_url));
        let short_hash = &hash[..6];

        vec![
            format!("{} ({}).cbz", base, short_hash),
            format!("{}.cbz", base),
            format!("{}_{}.cbz", base, short_hash),
            base,
        ]
    }
}
