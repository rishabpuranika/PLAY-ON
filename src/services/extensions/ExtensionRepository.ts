/**
 * ====================================================================
 * EXTENSION REPOSITORY SERVICE
 * ====================================================================
 * 
 * Manages external extension repositories.
 * Allows users to add repo URLs and fetch available extensions.
 * ====================================================================
 */

import { fetch } from '@tauri-apps/plugin-http';
import { ExtensionMeta, RepositoryIndex, ExtensionRepo } from './types';

const REPOS_STORAGE_KEY = 'extension-repos';

// Default repository - automatically added on first launch
const DEFAULT_REPO_URL = 'https://raw.githubusercontent.com/MemestaVedas/extensions/main/Manga';

class ExtensionRepositoryService {
    private repos: ExtensionRepo[] = [];

    constructor() {
        this.loadRepos();
    }

    /**
     * Load repos from localStorage
     */
    private loadRepos(): void {
        try {
            const saved = localStorage.getItem(REPOS_STORAGE_KEY);
            if (saved) {
                this.repos = JSON.parse(saved);
            }

            // Auto-add default repo if no repos exist (Skip on mobile)
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            if (this.repos.length === 0 && !isMobile) {
                console.log('[ExtensionRepository] No repos found, adding default repository');
                this.repos.push({
                    url: DEFAULT_REPO_URL,
                    name: 'PLAY-ON! Official',
                    addedAt: Date.now()
                });
                this.saveRepos();
            }
        } catch (e) {
            console.error('[ExtensionRepository] Failed to load repos:', e);
            this.repos = [];
        }
    }

    /**
     * Save repos to localStorage
     */
    private saveRepos(): void {
        localStorage.setItem(REPOS_STORAGE_KEY, JSON.stringify(this.repos));
    }

    /**
     * Add a new repository URL
     */
    async addRepo(url: string): Promise<RepositoryIndex> {
        // Normalize URL: remove trailing slash, handle direct index.json links
        let normalizedUrl = url.trim().replace(/\/$/, '');

        // If user pasted a direct link to index.json, extract the base URL
        if (normalizedUrl.endsWith('/index.json')) {
            normalizedUrl = normalizedUrl.replace(/\/index\.json$/, '');
        }
        // Also handle index.min.json (common in Mihon repos - but won't work)
        if (normalizedUrl.endsWith('/index.min.json')) {
            throw new Error(
                'This appears to be a Mihon/Tachiyomi repository (index.min.json). ' +
                'PLAY-ON! uses a different extension format. ' +
                'Mihon extensions (APKs) are not compatible with this app.'
            );
        }

        // Check if already added
        if (this.repos.some(r => r.url === normalizedUrl)) {
            throw new Error('Repository already added');
        }

        // Fetch index to validate and get name
        const index = await this.fetchRepoIndex(normalizedUrl);

        // Add to list
        this.repos.push({
            url: normalizedUrl,
            name: index.name,
            addedAt: Date.now()
        });
        this.saveRepos();

        console.log(`[ExtensionRepository] Added repo: ${index.name} (${normalizedUrl})`);
        return index;
    }

    /**
     * Remove a repository
     */
    removeRepo(url: string): void {
        const normalizedUrl = url.replace(/\/$/, '');
        this.repos = this.repos.filter(r => r.url !== normalizedUrl);
        this.saveRepos();
        console.log(`[ExtensionRepository] Removed repo: ${normalizedUrl}`);
    }

    /**
     * Get all added repositories
     */
    getRepos(): ExtensionRepo[] {
        return [...this.repos];
    }

    /**
     * Fetch the index.json from a repository URL
     */
    async fetchRepoIndex(repoUrl: string): Promise<RepositoryIndex> {
        const indexUrl = `${repoUrl}/index.json`;
        console.log(`[ExtensionRepository] Fetching index from: ${indexUrl}`);

        try {
            const response = await fetch(indexUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PLAY-ON!/1.0'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(
                        `Repository not found (404). Make sure the URL points to a directory containing an index.json file.`
                    );
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let index: RepositoryIndex;
            try {
                index = await response.json();
            } catch {
                throw new Error('Invalid JSON response. The URL may not point to a valid PLAY-ON! repository.');
            }

            // Validate structure
            if (!index.name || !Array.isArray(index.extensions)) {
                // Check if it looks like a Mihon/Tachiyomi index
                if (Array.isArray(index) && index[0]?.apk) {
                    throw new Error(
                        'This is a Mihon/Tachiyomi repository. PLAY-ON! uses JavaScript bundles, not APKs. ' +
                        'Mihon extensions are not compatible with this app.'
                    );
                }
                throw new Error(
                    'Invalid repository format. Expected {"name": "...", "extensions": [...]}.'
                );
            }

            console.log(`[ExtensionRepository] Found ${index.extensions.length} extensions in ${index.name}`);
            return index;
        } catch (error) {
            console.error(`[ExtensionRepository] Failed to fetch index:`, error);
            if (error instanceof Error) {
                throw error; // Re-throw with original message
            }
            throw new Error(`Failed to fetch repository: ${error}`);
        }
    }

    /**
     * Fetch extension bundle code from URL
     */
    async fetchExtensionBundle(bundleUrl: string): Promise<string> {
        console.log(`[ExtensionRepository] Fetching bundle from: ${bundleUrl}`);

        try {
            const response = await fetch(bundleUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/javascript, text/javascript',
                    'User-Agent': 'PLAY-ON!/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const code = await response.text();
            console.log(`[ExtensionRepository] Fetched bundle (${code.length} chars)`);
            return code;
        } catch (error) {
            console.error(`[ExtensionRepository] Failed to fetch bundle:`, error);
            throw new Error(`Failed to download extension: ${error}`);
        }
    }

    /**
     * Fetch all extensions from all repositories
     */
    async fetchAllExtensions(): Promise<{ repoUrl: string; repoName: string; extensions: ExtensionMeta[] }[]> {
        const results: { repoUrl: string; repoName: string; extensions: ExtensionMeta[] }[] = [];

        for (const repo of this.repos) {
            try {
                const index = await this.fetchRepoIndex(repo.url);
                results.push({
                    repoUrl: repo.url,
                    repoName: index.name,
                    extensions: index.extensions
                });
            } catch (error) {
                console.error(`[ExtensionRepository] Failed to fetch from ${repo.url}:`, error);
                // Continue with other repos
            }
        }

        return results;
    }
}

// Singleton instance
export const ExtensionRepository = new ExtensionRepositoryService();
