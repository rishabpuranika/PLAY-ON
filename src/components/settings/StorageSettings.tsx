import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function StorageSettings() {
    const [downloadPath, setDownloadPath] = useState<string | null>(null);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        // Load current setting on mount
        invoke<string | null>('get_download_location')
            .then(setDownloadPath)
            .catch((err) => console.error(err));
    }, []);

    const handlePickDirectory = async () => {
        try {
            const selected = await invoke<string>('pick_download_directory');

            if (selected) {
                setDownloadPath(selected);
                setError('');
            }
        } catch (err) {
            setError(err as string);
        }
    };

    return (
        <div className="storage-settings p-4 bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-2 text-white">Storage Location</h2>
            <p className="description text-gray-400 mb-4">
                Select where your downloads and local content will be stored.
                This folder will contain subdirectories: downloads, local, and backup.
            </p>

            <div className="current-path mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Current Location:</label>
                <code className="block bg-gray-900 p-2 rounded text-sm text-green-400 overflow-x-auto">
                    {downloadPath || 'Not set (using default)'}
                </code>
            </div>

            <button
                onClick={handlePickDirectory}
                className="btn-primary px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
                {downloadPath ? 'Change Location' : 'Select Folder'}
            </button>

            {error && <div className="error mt-2 text-red-500 text-sm">{error}</div>}

            <div className="info-box mt-6 p-3 bg-blue-900/30 border border-blue-800 rounded">
                <h4 className="font-semibold text-blue-300 mb-1">Note:</h4>
                <ul className="list-disc list-inside text-sm text-blue-200">
                    <li>Do not use system folders like "Downloads" or "Documents"</li>
                    <li>Create a dedicated folder (e.g., "PLAY-ON") for this app</li>
                    <li>On Android, you must grant storage permissions</li>
                </ul>
            </div>
        </div>
    );
}
