import type { BasePalette } from './color';
import { t } from './i18n';

// ---------- Temas (oscuros y claros) ----------
export type Theme = { id: string; name: string; scheme: 'dark' | 'light'; palette: BasePalette };
export const THEMES: Record<string, Theme> = {
  // v26: los temas de la marca (Margen). Su acento se elige aparte (lib/brand.ts).
  'kaderno-oscuro': { id: 'kaderno-oscuro', name: t('Kaderno oscuro'), scheme: 'dark', palette: {
    bg: '#12131F', surface: '#1A1C2C', surface2: '#23263A', line: '#2E3149', text: '#ECEBF4', muted: '#A3A4BC', brand: '#F2674E', brand2: '#7FB5FF', good: '#3FC98A', warn: '#F2B44C', bad: '#FF5C70' } },
  'kaderno-claro': { id: 'kaderno-claro', name: t('Kaderno claro'), scheme: 'light', palette: {
    bg: '#F7F4EE', surface: '#FFFFFF', surface2: '#EFEAE0', line: '#E2DCCF', text: '#1B1D3A', muted: '#5E6077', brand: '#C93F28', brand2: '#2F6FE0', good: '#12A150', warn: '#B9770A', bad: '#D6334A' } },
  medianoche: { id: 'medianoche', name: t('Medianoche'), scheme: 'dark', palette: {
    bg: '#0f1115', surface: '#181b22', surface2: '#20242e', line: '#2a2f3a', text: '#e8eaf0', muted: '#9aa3b2', brand: '#6c8cff', brand2: '#8b6cff', good: '#37c98b', warn: '#f5b64c', bad: '#f56c6c' } },
  carbon: { id: 'carbon', name: t('Carbón'), scheme: 'dark', palette: {
    bg: '#101012', surface: '#1a1a1e', surface2: '#232329', line: '#33333c', text: '#ececee', muted: '#9a9aa5', brand: '#7c9cff', brand2: '#a78bfa', good: '#4ade80', warn: '#fbbf24', bad: '#f87171' } },
  bosque: { id: 'bosque', name: t('Bosque'), scheme: 'dark', palette: {
    bg: '#0d1512', surface: '#152019', surface2: '#1d2b22', line: '#26382d', text: '#e6f0ea', muted: '#9ab5a6', brand: '#34d399', brand2: '#5eead4', good: '#4ade80', warn: '#fbbf24', bad: '#f87171' } },
  oceano: { id: 'oceano', name: t('Océano'), scheme: 'dark', palette: {
    bg: '#0b1220', surface: '#111a2b', surface2: '#182438', line: '#243449', text: '#e6edf7', muted: '#93a4bd', brand: '#38bdf8', brand2: '#818cf8', good: '#34d399', warn: '#fbbf24', bad: '#fb7185' } },
  vino: { id: 'vino', name: t('Vino'), scheme: 'dark', palette: {
    bg: '#160f14', surface: '#1f151d', surface2: '#2a1d28', line: '#3a2a37', text: '#f2e9ef', muted: '#bda3b4', brand: '#f472b6', brand2: '#c084fc', good: '#4ade80', warn: '#fbbf24', bad: '#fb7185' } },
  papel: { id: 'papel', name: t('Papel'), scheme: 'light', palette: {
    bg: '#f6f7f9', surface: '#ffffff', surface2: '#eef1f5', line: '#dfe3ea', text: '#1c2230', muted: '#5c6675', brand: '#4566f7', brand2: '#7c5cff', good: '#12a150', warn: '#c9820a', bad: '#e5484d' } },
  crema: { id: 'crema', name: t('Crema'), scheme: 'light', palette: {
    bg: '#faf6ef', surface: '#fffdf8', surface2: '#f2ebdd', line: '#e4dbc8', text: '#2a2419', muted: '#6f6553', brand: '#b05f1c', brand2: '#8a6d3b', good: '#2f9e44', warn: '#b9770a', bad: '#e5484d' } },
  cielo: { id: 'cielo', name: t('Cielo'), scheme: 'light', palette: {
    bg: '#eef4fb', surface: '#ffffff', surface2: '#e2ecf7', line: '#cddcee', text: '#12233a', muted: '#516074', brand: '#0a6bff', brand2: '#6a5cff', good: '#12a150', warn: '#c9820a', bad: '#e5484d' } },
  rosa: { id: 'rosa', name: t('Rosa'), scheme: 'light', palette: {
    bg: '#fff5f8', surface: '#ffffff', surface2: '#ffe8ef', line: '#f6d3de', text: '#2b1621', muted: '#7c5a68', brand: '#d82d74', brand2: '#b06cf0', good: '#12a150', warn: '#c9820a', bad: '#e5484d' } },
  menta: { id: 'menta', name: t('Menta'), scheme: 'light', palette: {
    bg: '#eef7f1', surface: '#ffffff', surface2: '#dff0e6', line: '#c9e3d3', text: '#122a1e', muted: '#4f6a5b', brand: '#0f8542', brand2: '#0ea5a5', good: '#12a150', warn: '#c9820a', bad: '#e5484d' } },
};
