import { defineConfig } from 'vite';

export default defineConfig({
  // O site vive em danilobertolini.github.io/mercado-compras/, não na raiz do
  // domínio, então os caminhos gerados precisam carregar esse prefixo.
  base: '/mercado-compras/',
});
