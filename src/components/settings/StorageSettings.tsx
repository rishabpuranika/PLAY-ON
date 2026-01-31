import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Detect if running on Android
const isAndroid = navigator.userAgent.toLowerCase().includes('android') ||
    (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label === 'main';

export function StorageSettings() {
    const [downloadPath, setDownloadPath] = useState<string | null>(null);
    const [error, setError] = useState<string>('');
    const [manualPath, setManualPath] = useState<string>('');
    const [showManualInput, setShowManualInput] = useState(false);

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

    const handleSetManualPath = async () => {
        if (!manualPath.trim()) {
            setError('Please enter a valid path');
            return;
        }
        try {
            const result = await invoke<string>('set_download_directory', { path: manualPath.trim() });
            setDownloadPath(result);
            setError('');
            setShowManualInput(false);
            setManualPath('');
        } catch (err) {
            setError(err as string);
        }
    };

    return (
        <div className="storage-settings p-4 bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-2 text-white">Storage Location</h2>
            <p className="description text-gray-400 mb-4">
                Select where your downloads and local content will be stored.
            </p>

            <div className="current-path mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Current Location:</label>
                <code className="block bg-gray-900 p-2 rounded text-sm text-green-400 overflow-x-auto">
                    {downloadPath || 'Not set (using default)'}
                </code>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    onClick={handlePickDirectory}
                    className="btn-primary px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                    {downloadPath ? 'Change Location' : 'Select Folder'}
                </button>

                <button
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                    Enter Path
                </button>

                {isAndroid && (
                    <button
                        onClick={() => invoke('request_storage_permission').catch(console.error)}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded transition-colors"
                    >
                        Grant Permissions
                    </button>
                )}
            </div>

            {showManualInput && (
                <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Enter path manually:
                    </label>
                    <input
                        type="text"
                        value={manualPath}
                        onChange={(e) => setManualPath(e.target.value)}
                        placeholder="/storage/emulated/0/PLAY-ON"
                        className="w-full px-3 py-2 bg-gray-800 text-white rounded border border-gray-700 mb-2"
                    />
                    <button
                        onClick={handleSetManualPath}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
                    >
                        Set Path
                    </button>
                </div>
            )}

            {error && <div className="error mt-2 text-red-500 text-sm">{error}</div>}

            <div className="info-box mt-6 p-3 bg-blue-900/30 border border-blue-800 rounded">
                <h4 className="font-semibold text-blue-300 mb-1">Note:</h4>
                <ul className="list-disc list-inside text-sm text-blue-200">
                    <li>Create a dedicated folder (e.g., "PLAY-ON") for this app</li>
                    <li>On Android: Use "Enter Path" to type your folder path</li>
                    <li>Common path: /storage/emulated/0/PLAY-ON</li>
                </ul>
            </div>
        </div>
    );
}
