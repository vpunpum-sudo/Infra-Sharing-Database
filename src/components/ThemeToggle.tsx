import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { motion } from 'motion/react';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', showLabel = false }) => {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`relative inline-flex items-center gap-2 p-2 rounded-xl transition-all duration-200 cursor-pointer ${
        isLight
          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100/80 border border-amber-200 shadow-sm'
          : 'bg-slate-800 text-slate-300 hover:text-amber-400 hover:bg-slate-700/80 border border-slate-700/80 shadow-sm'
      } ${className}`}
      title={isLight ? 'สลับเป็นโหมดมืด (Dark Mode)' : 'สลับเป็นโหมดสว่าง (Light Mode)'}
      aria-label="Toggle theme"
    >
      <motion.div
        key={theme}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-center"
      >
        {isLight ? (
          <Sun className="w-4 h-4 text-amber-500 fill-amber-500/20" />
        ) : (
          <Moon className="w-4 h-4 text-amber-400" />
        )}
      </motion.div>
      {showLabel && (
        <span className="text-xs font-semibold select-none">
          {isLight ? 'โหมดสว่าง' : 'โหมดมืด'}
        </span>
      )}
    </button>
  );
};
