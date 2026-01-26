import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Dropdown.css';

export interface DropdownOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

interface CommonProps {
    options: DropdownOption[];
    placeholder?: string;
    className?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
}

interface SingleProps extends CommonProps {
    multiple?: false;
    value: string;
    onChange: (value: string) => void;
}

interface MultiProps extends CommonProps {
    multiple: true;
    value: string[];
    onChange: (value: string[]) => void;
}

export type DropdownProps = SingleProps | MultiProps;

export const Dropdown: React.FC<DropdownProps> = (props) => {
    const {
        options,
        placeholder = 'Select...',
        className = '',
        icon,
        disabled = false,
        multiple = false
    } = props;

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    // Update coordinates
    const updateCoords = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Logic updated for portal:
            // Check if click is outside trigger AND outside portal menu
            // But since portal menu is not a child of containerRef, we need to check strictly.
            // Actually, we can just check if target is NOT containerRef (trigger)
            // AND check if it's not inside the dropdown menu (which we can reference via ID or ref, but easier to just stopPropagation on menu click!)

            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // If it's in the portal, the portal events might propagate?
                // Standard approach: use a ref for the portal content too.
                // But simplified: checking if click is inside the trigger is enough if we handle portal clicks separately.
                // However, clicking "outside" includes clicking on the portal menu if we aren't careful?
                // No, clicking on portal menu is "outside" textually, but we don't want to close.
                // WE WILL STOP PROPAGATION ON PORTAL MENU.
                setIsOpen(false);
            }
        };

        if (isOpen) {
            updateCoords();
            window.addEventListener('resize', updateCoords);
            window.addEventListener('click', handleClickOutside); // Use click instead of mousedown to play nice with portal stopPropagation?
            window.addEventListener('scroll', updateCoords, true);
        }
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('click', handleClickOutside);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }, [isOpen]);

    const toggleOpen = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent immediate close by window listener
        if (!disabled) {
            if (!isOpen) updateCoords();
            setIsOpen(!isOpen);
        }
    };

    const handleSelect = (optionValue: string) => {
        if (multiple) {
            const currentValues = (props as MultiProps).value || [];
            const newValue = currentValues.includes(optionValue)
                ? currentValues.filter(v => v !== optionValue)
                : [...currentValues, optionValue];
            (props as MultiProps).onChange(newValue);
        } else {
            (props as SingleProps).onChange(optionValue);
            setIsOpen(false);
        }
    };

    const isSelected = (optionValue: string) => {
        if (multiple) {
            return ((props as MultiProps).value || []).includes(optionValue);
        }
        return (props as SingleProps).value === optionValue;
    };

    const getDisplayLabel = () => {
        if (multiple) {
            const selectedValues = (props as MultiProps).value || [];
            if (selectedValues.length === 0) return placeholder;
            if (selectedValues.length === options.length) return 'All Selected';
            if (selectedValues.length > 2) return `${selectedValues.length} Selected`;
            return selectedValues.map(v => options.find(o => o.value === v)?.label).join(', ');
        } else {
            const val = (props as SingleProps).value;
            const option = options.find(opt => opt.value === val);
            return option ? option.label : placeholder;
        }
    };

    const menu = isOpen && coords && (
        <div
            className={`glass-dropdown-menu is-open`}
            style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 9999,
                opacity: 1, // Ensure visibility overrides
                transform: 'none', // Reset transform animation that might rely on relative positioning
                marginTop: 0
            }}
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
            onMouseDown={(e) => e.stopPropagation()}
        >
            {options.map((option) => {
                const selected = isSelected(option.value);
                return (
                    <div
                        key={option.value}
                        className={`glass-dropdown-item ${selected ? 'is-selected' : ''}`}
                        onClick={() => handleSelect(option.value)}
                    >
                        <div className="glass-dropdown-item-check">
                            {selected && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}
                        </div>
                        {option.icon && <span style={{ marginRight: '0.5rem' }}>{option.icon}</span>}
                        {option.label}
                    </div>
                );
            })}
            {options.length === 0 && (
                <div style={{ padding: '0.8rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: '0.85rem' }}>
                    No options
                </div>
            )}
        </div>
    );

    return (
        <div
            className={`glass-dropdown-container ${className}`}
            ref={containerRef}
        // removed zIndex style as we are portaling
        >
            <div
                className={`glass-dropdown-trigger ${isOpen ? 'is-open' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={toggleOpen}
                style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    {icon}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getDisplayLabel()}
                    </span>
                </div>

                <svg
                    className="glass-dropdown-arrow"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>

            {isOpen && createPortal(menu, document.body)}
        </div>
    );
};
