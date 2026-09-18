import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

/**
 * Validar al arrancar y no en la primera conexion: un typo en CLIENT_ORIGIN da
 * un error de CORS que desde el navegador se ve como "no conecta" y cuesta
 * media hora encontrar.
 */

const prod = { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://uno.app' };

describe('loadConfig', () => {
  it('usa localhost por defecto en desarrollo', () => {
    const config = loadConfig({});
    expect(config.clientOrigins).toEqual(['http://localhost:5173']);
    expect(config.isProduction).toBe(false);
  });

  it('EXIGE CLIENT_ORIGIN en produccion', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('acepta varios origenes separados por coma', () => {
    const config = loadConfig({
      ...prod,
      CLIENT_ORIGIN: 'https://uno.app, https://uno-preview.vercel.app',
    });
    expect(config.clientOrigins).toEqual(['https://uno.app', 'https://uno-preview.vercel.app']);
  });

  it("rechaza '*', que es la tentacion cuando algo no conecta", () => {
    // Con '*' cualquier pagina puede abrir sockets contra el servidor.
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: '*' })).toThrow(/no puede ser/);
  });

  it('rechaza una URL mal formada', () => {
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: 'uno.app' })).toThrow(/invalido/);
  });

  it('rechaza un origen con path o query', () => {
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: 'https://uno.app/juego' })).toThrow(
      /solo el origen/,
    );
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: 'https://uno.app?x=1' })).toThrow(
      /solo el origen/,
    );
  });

  it('exige https en produccion, salvo localhost', () => {
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: 'http://uno.app' })).toThrow(/https/);
    expect(() => loadConfig({ ...prod, CLIENT_ORIGIN: 'http://localhost:5173' })).not.toThrow();
  });

  it('permite http en desarrollo', () => {
    expect(() => loadConfig({ CLIENT_ORIGIN: 'http://192.168.1.5:5173' })).not.toThrow();
  });

  describe('numeros', () => {
    it('toma los defaults si no se especifican', () => {
      const config = loadConfig({});
      expect(config.port).toBe(3000);
      expect(config.reconnectGraceMs).toBe(120_000);
    });

    it('acepta valores dentro de rango', () => {
      const config = loadConfig({ PORT: '8080', TURN_TIMEOUT_MS: '30000' });
      expect(config.port).toBe(8080);
      expect(config.options.turnTimeoutMs).toBe(30_000);
    });

    it('rechaza lo que no es un entero', () => {
      expect(() => loadConfig({ PORT: 'ocho mil' })).toThrow(/entero/);
      expect(() => loadConfig({ PORT: '80.5' })).toThrow(/entero/);
    });

    it('rechaza valores fuera de rango', () => {
      expect(() => loadConfig({ PORT: '99999' })).toThrow(/entre/);
      // Un timeout de 1s dejaria a todos sin tiempo de jugar.
      expect(() => loadConfig({ TURN_TIMEOUT_MS: '1000' })).toThrow(/entre/);
    });

    it('trata el string vacio como ausente', () => {
      expect(loadConfig({ PORT: '' }).port).toBe(3000);
    });
  });
});
