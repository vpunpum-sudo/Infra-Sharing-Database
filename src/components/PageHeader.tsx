import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Breadcrumb } from '../utils/pageContext';

export function PageHeader({ title, breadcrumbs, actions }: {
  title: string;
  breadcrumbs: readonly Breadcrumb[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="เส้นทางหน้า">
            <ol className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className={`flex items-center gap-1 min-w-0 ${crumb.current ? '' : 'hidden sm:flex'}`}>
                  {index > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
                  {crumb.path && !crumb.current ? (
                    <Link to={crumb.path} className="hover:text-brand-400 truncate">{crumb.label}</Link>
                  ) : (
                    <span aria-current={crumb.current ? 'page' : undefined} className={`truncate ${crumb.current ? 'font-bold text-slate-300' : ''}`}>{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight font-display truncate">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
