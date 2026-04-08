import React from 'react';

const ThemeIcon = ({ theme, size = 18, color = 'currentColor' }) => (
    theme === 'light' ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
                d="M20 15.5A7.5 7.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"
                stroke={color}
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.8" />
            <path
                d="M12 2.75V5.25M12 18.75V21.25M21.25 12H18.75M5.25 12H2.75M18.54 5.46L16.77 7.23M7.23 16.77L5.46 18.54M18.54 18.54L16.77 16.77M7.23 7.23L5.46 5.46"
                stroke={color}
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    )
);

function AuthThemeToggle({ theme, onToggle }) {
    return (
        <button
            type="button"
            className="auth-theme-toggle-btn"
            onClick={onToggle}
            title="Toggle theme"
            aria-label="Toggle theme"
        >
            <ThemeIcon theme={theme} />
        </button>
    );
}

export default AuthThemeToggle;
