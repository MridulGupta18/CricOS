import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOvers(overs: number): string {
  const completed = Math.floor(overs);
  const balls = Math.round((overs - completed) * 10);
  return `${completed}.${balls}`;
}

export function formatStrikeRate(sr: number): string {
  return sr.toFixed(1);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(date));
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, minimumFractionDigits: 0,
  }).format(amount / 100);
}

export function formatOversDisplay(completed: number, balls: number): string {
  return `${completed}.${balls}`;
}
