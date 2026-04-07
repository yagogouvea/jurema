// Categorias reais do catálogo Jumera Sport
// Baseadas nos nomes exatos das pastas do catálogo da cliente

export const CATEGORIES = [
  { key: '1linha-nacional',       label: 'R$30,00/at - 1 LINHA - NACIONAL',                    price: 'R$30,00/at',  short: '1 Linha Nacional' },
  { key: 'tailandesa-promocao',   label: 'R$35,00/at - TAILANDESA Promoção (PEQUENAS MANCHAS)', price: 'R$35,00/at',  short: 'Tailandesa Promoção' },
  { key: 'conj-calor-nacional',   label: 'R$50,00/at - CONJ CALOR - NACIONAL',                  price: 'R$50,00/at',  short: 'Conj. Calor Nacional' },
  { key: 'conj-calor-tailandesa', label: 'R$75,00/at - CONJ CALOR TAILANDESA',                  price: 'R$75,00/at',  short: 'Conj. Calor Tailandesa' },
  { key: 'tailandesa',            label: 'R$80,00/at - TAILANDESA',                             price: 'R$80,00/at',  short: 'Tailandesa' },
  { key: 'infantil',              label: 'R$80,00/at Infantil',                                 price: 'R$80,00/at',  short: 'Infantil' },
  { key: 'jogador-tailandesa',    label: 'R$110,00/at - JOGADOR TAILANDESA',                    price: 'R$110,00/at', short: 'Jogador Tailandesa' },
  { key: 'retro-tailandesa',      label: 'R$110,00/at - RETRO TAILANDESA',                      price: 'R$110,00/at', short: 'Retrô Tailandesa' },
  { key: 'conj-frio-tailandes',   label: 'R$180,00/at - CONJ FRIO TAILANDÊS',                   price: 'R$180,00/at', short: 'Conj. Frio Tailandês' },
  { key: 'tailandesa-3xl',        label: 'R$variado - tailandesa 3XL',                          price: 'R$variado',   short: 'Tailandesa 3XL' },
  { key: 'tailandesa-4xl',        label: 'R$variados - tailandesa 4XL',                         price: 'R$variado',   short: 'Tailandesa 4XL' },
] as const;

export type CategoryKey = typeof CATEGORIES[number]['key'];

export function getCategoryLabel(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.label ?? key;
}

export function getCategoryShort(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.short ?? key;
}
