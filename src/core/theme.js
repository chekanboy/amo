// Светлая/тёмная тема (сохраняется в localStorage 'alfa_theme')
import { state } from './state.js';
import { renderTab } from './render.js';

export function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('alfa_theme', theme);
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = theme==='dark' ? '🌙' : '☀️';
  // Перерисовываем графики с новыми цветами осей
  if(state.raw) setTimeout(()=>renderTab(state.currentTab), 50);
}

export function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur==='light' ? 'dark' : 'light');
}
