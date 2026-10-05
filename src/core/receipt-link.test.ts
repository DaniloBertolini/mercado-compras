import { describe, expect, it } from 'vitest';
import { parseReceiptLink } from './receipt-link.js';

describe('parseReceiptLink', () => {
  it('aceita o endereço da consulta da NFC-e', () => {
    const qr =
      'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41260812345678000190650010000012341234567890|2|1|1|abc123';
    expect(parseReceiptLink(qr)).toBe(qr);
  });

  it('aceita http, que alguns estados ainda usam', () => {
    expect(parseReceiptLink('http://nfce.sefaz.br/consulta?p=123')).toBe(
      'http://nfce.sefaz.br/consulta?p=123',
    );
  });

  it('ignora espaços em volta', () => {
    expect(parseReceiptLink('  https://sefaz.br/x  ')).toBe('https://sefaz.br/x');
  });

  it('recusa esquema que não é web', () => {
    // mirar a câmera num QR não pode ser o bastante para executar algo
    expect(parseReceiptLink('javascript:alert(1)')).toBeNull();
    expect(parseReceiptLink('file:///etc/passwd')).toBeNull();
    expect(parseReceiptLink('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('recusa QR que não é endereço nenhum', () => {
    expect(parseReceiptLink('PIX0014BR.GOV.BCB.PIX')).toBeNull();
    expect(parseReceiptLink('')).toBeNull();
    expect(parseReceiptLink('   ')).toBeNull();
  });
});
