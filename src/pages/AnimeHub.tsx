import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnimeBrowse from './AnimeBrowse';
import AnimeLibrary from './AnimeLibrary';

export default function AnimeHub() {
    const [searchParams] = useSearchParams();
    // Default to 'browse' if searching, otherwise 'library'
    const initialView = (searchParams.get('q') || searchParams.get('source')) ? 'browse' : 'library';
    const [view, setView] = useState<'library' | 'browse'>(initialView);

    return (
        <div className="flex flex-col h-full bg-[#111111]">
            {/* Top Navigation Toggle */}
            <div className="flex items-center justify-center p-2 bg-black/30 backdrop-blur-md pt-safe-top pt-4">
                <div className="flex bg-white/5 p-1 rounded-full items-center relative">
                    <button
                        onClick={() => setView('library')}
                        className={`px-6 py-1.5 rounded-full text-sm font-medium transition-all duration-200 z-10 ${view === 'library'
                            ? 'text-white'
                            : 'text-white/50 hover:text-white/80'
                            }`}
                    >
                        Library
                    </button>
                    <button
                        onClick={() => setView('browse')}
                        className={`px-6 py-1.5 rounded-full text-sm font-medium transition-all duration-200 z-10 ${view === 'browse'
                            ? 'text-white'
                            : 'text-white/50 hover:text-white/80'
                            }`}
                    >
                        Browse
                    </button>

                    {/* Animated Pill Background */}
                    <div
                        className={`absolute top-1 bottom-1 rounded-full bg-[#9213ec] transition-all duration-300 ease-out`}
                        style={{
                            left: view === 'library' ? '4px' : '50%',
                            width: 'calc(50% - 4px)',
                        }}
                    />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                <div className={`absolute inset-0 transition-opacity duration-300 ${view === 'library' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}`}>
                    <AnimeLibrary />
                </div>
                <div className={`absolute inset-0 transition-opacity duration-300 ${view === 'browse' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'}`}>
                    {/* Only mount Browse when needed IF performance is an issue, but standard keep-alive logic says keep it. 
                       However, Browse might be heavy. Let's keep Library mounted always as it's the "home". 
                       Browsing is transient. But for now, let's keep both to completely solve the refetch issue. */}
                    <AnimeBrowse />
                </div>
            </div>
        </div>
    );
}
