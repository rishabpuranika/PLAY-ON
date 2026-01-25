import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { HomeIcon, LibraryIcon, CompassIcon, SettingsIcon, BookOpenIcon, CalendarIcon } from './Icons';

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
            className={`flex flex-col items-center justify-center w-full h-full py-1 transition-colors duration-200 ${isActive ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
        >
            <div className={`p-1 rounded-lg ${isActive ? 'bg-blue-500/10' : 'bg-transparent'}`}>
                {icon}
            </div>
            <span className="text-[10px] mt-1 font-medium">{label}</span>
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] bg-[#0f0f13]/90 backdrop-blur-xl border-t border-white/5 z-50 flex items-center justify-around px-2 pb-safe">
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
    );
};

export default MobileNav;
