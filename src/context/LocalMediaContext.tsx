import React, { createContext, useContext, useState, useEffect } from 'react';
import { pickDirectory } from '../lib/fileSystem';

import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface LocalFolder {
    path: string;
    label: string;
    type: 'anime' | 'manga';
}

interface LocalMediaContextType {
    folders: LocalFolder[];
    addFolder: (type: 'anime' | 'manga') => Promise<void>;
    removeFolder: (path: string) => void;
    setupDefaultLibrary: () => Promise<void>;
    animeFolders: LocalFolder[];
    mangaFolders: LocalFolder[];
}

const LocalMediaContext = createContext<LocalMediaContextType | undefined>(undefined);

export function LocalMediaProvider({ children }: { children: React.ReactNode }) {
    const [folders, setFolders] = useState<LocalFolder[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('local-folders');
        console.log("LocalMediaContext: Loading from localStorage:", saved);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                console.log("LocalMediaContext: Parsed folders:", parsed);

                // Migration: valid existing folders that barely have path/label to type='anime'
                const migrated = parsed.map((f: any) => ({
                    ...f,
                    type: f.type || 'anime'
                }));

                setFolders(migrated);
            } catch (e) {
                console.error("Failed to parse local folders", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Save to localStorage whenever folders change (but only after initial load)
    useEffect(() => {
        if (!isLoaded) return; // Don't save until we've loaded
        console.log("LocalMediaContext: Saving to localStorage:", folders);
        localStorage.setItem('local-folders', JSON.stringify(folders));
    }, [folders, isLoaded]);

    const addFolder = async (type: 'anime' | 'manga') => {
        try {
            const selected = await pickDirectory(`Select a ${type} folder to add`);

            if (selected) {
                // If user selected a directory, it comes as a string (or array if multiple, but we set multiple:false)
                const path = selected;
                // Extract last part of path as label (simple heuristic)
                // Handle both windows and unix separators
                const name = path.split(/[\\/]/).pop() || path;
                console.log(`LocalMediaContext: Adding folder: ${path}, label: ${name}, type: ${type}`);

                // Check if already exists
                if (!folders.some(f => f.path === path)) {
                    setFolders(prev => {
                        const newState = [...prev, { path, label: name, type }];
                        console.log("LocalMediaContext: New folders state:", newState);
                        return newState;
                    });
                } else {
                    console.log("LocalMediaContext: Folder already exists");
                }
            }
        } catch (err) {
            console.error("Failed to open dialog", err);
        }
    };

    const removeFolder = (path: string) => {
        setFolders(prev => prev.filter(f => f.path !== path));
    };

    const setupDefaultLibrary = async () => {
        try {
            // Mobile-only: Use fixed path
            const root = '/storage/emulated/0';
            const baseDir = await join(root, 'PLAYON');
            const animeDir = await join(baseDir, 'anime');
            const mangaDir = await join(baseDir, 'manga');

            // Create base directory
            if (!(await exists(baseDir))) {
                await mkdir(baseDir);
            }

            // Create subdirectories
            if (!(await exists(animeDir))) {
                await mkdir(animeDir);
            }
            if (!(await exists(mangaDir))) {
                await mkdir(mangaDir);
            }

            // Add to state
            setFolders(prev => {
                const newFolders = [...prev];
                // Check if paths already exist
                if (!newFolders.some(f => f.path === animeDir)) {
                    newFolders.push({ path: animeDir, label: 'anime', type: 'anime' });
                }
                if (!newFolders.some(f => f.path === mangaDir)) {
                    newFolders.push({ path: mangaDir, label: 'manga', type: 'manga' });
                }
                return newFolders;
            });

            alert(`Library created successfully in: ${baseDir}`);

        } catch (err) {
            console.error("Failed to setup library", err);
            alert("Failed to create folders. Please ensure you have write permissions.");
        }
    };

    const animeFolders = folders.filter(f => f.type === 'anime' || !f.type);
    const mangaFolders = folders.filter(f => f.type === 'manga');

    return (
        <LocalMediaContext.Provider value={{ folders, addFolder, removeFolder, setupDefaultLibrary, animeFolders, mangaFolders }}>
            {children}
        </LocalMediaContext.Provider>
    );
}

export function useLocalMedia() {
    const context = useContext(LocalMediaContext);
    if (context === undefined) {
        throw new Error('useLocalMedia must be used within a LocalMediaProvider');
    }
    return context;
}
