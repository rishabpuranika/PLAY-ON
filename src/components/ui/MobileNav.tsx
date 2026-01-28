import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, LibraryIcon, CompassIcon, BookOpenIcon, CalendarIcon } from './Icons';

interface MobileNavItemProps {
    label: string;
    path: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({ label, icon, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center w-full h-full relative group transition-all duration-300 ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
        >
            <div
                className={`transition-all duration-300 ${isActive ? 'transform -translate-y-1 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : ''
                    }`}
            >
                {icon}
            </div>

            <span className={`text-[10px] font-medium transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0 text-white' : 'opacity-100 text-gray-500'
                }`}>
                {label}
            </span>

            {/* Glowing Dot for Active State */}
            {isActive && (
                <div className="absolute -bottom-1 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            )}
        </button>
    );
};

const MobileNav: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { label: 'Home', path: '/home', icon: <HomeIcon size={20} /> },
        { label: 'Anime', path: '/anime-browse', icon: <CompassIcon size={20} /> },
        { label: 'Manga', path: '/manga-browse', icon: <BookOpenIcon size={20} /> },
        { label: 'My List', path: '/my-list', icon: <LibraryIcon size={20} /> },
        { label: 'Calendar', path: '/calendar', icon: <CalendarIcon size={20} /> },
    ];

    return (
        <div className="md:hidden fixed z-50 left-1/2 -translate-x-1/2 bottom-0.25 w-[95%] max-w-[380px] h-[76px]">
            <div className="bg-[#0f0f13]/75 backdrop-blur-2xl border border-white/5 rounded-3xl h-[77px] shadow-2xl shadow-black/50 flex items-center justify-between px-4">
                {navItems.map((item) => (
                    <MobileNavItem
                        key={item.path}
                        label={item.label}
                        path={item.path}
                        icon={item.icon}
                        isActive={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                    />
                ))}
            </div>
        </div>
    );
};

export default MobileNav;
