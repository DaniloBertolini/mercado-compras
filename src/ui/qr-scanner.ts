/**
 * Leitor de QR code usando a câmera.
 *
 * Usa o `BarcodeDetector` embutido no navegador em vez de uma biblioteca de
 * decodificação: no Chrome do Android — que é onde o app é usado, de pé no
 * mercado — ele já existe e custa zero no bundle. Em compensação **não existe
 * no Chrome do Windows**, então quem chama precisa checar `isQrScanSupported()`
 * e esconder o botão em vez de oferecer algo que vai falhar.
 */

interface DetectedBarcode {
  readonly rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getDetectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

export function isQrScanSupported(): boolean {
  return getDetectorConstructor() !== null && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Erro com texto pronto para aparecer na tela, não para um log. */
export class ScanError extends Error {}

export interface QrScan {
  /** Resolve com o conteúdo do primeiro QR lido, ou `null` se você cancelar. */
  readonly found: Promise<string | null>;
  /** Desliga a câmera. Seguro chamar mais de uma vez. */
  stop(): void;
}

const SCAN_INTERVAL_MS = 250;

/**
 * Liga a câmera traseira no elemento de vídeo e procura um QR até achar um ou
 * até `stop()`. A câmera é desligada nos dois casos — deixá-la ligada num
 * celular no bolso seria bem pior que a feature valer a pena.
 */
export function scanQr(video: HTMLVideoElement): QrScan {
  const DetectorClass = getDetectorConstructor();
  if (!DetectorClass) {
    return {
      found: Promise.reject(new ScanError('Este navegador não tem leitor de QR code.')),
      stop: () => {},
    };
  }

  const detector = new DetectorClass({ formats: ['qr_code'] });
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let settled = false;

  let finish: (value: string | null) => void = () => {};
  let fail: (reason: unknown) => void = () => {};

  const found = new Promise<string | null>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    video.srcObject = null;
  }

  function settle(value: string | null): void {
    if (settled) return;
    settled = true;
    stop();
    finish(value);
  }

  function abort(error: unknown): void {
    if (settled) return;
    settled = true;
    stop();
    fail(error);
  }

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (settled) {
        stop(); // cancelado enquanto a permissão estava sendo pedida
        return;
      }

      video.srcObject = stream;
      await video.play();

      timer = setInterval(() => {
        void (async () => {
          try {
            const codes = await detector.detect(video);
            const first = codes[0];
            if (first) settle(first.rawValue);
          } catch {
            // quadro ruim (desfocado, escuro): a próxima leitura tenta de novo
          }
        })();
      }, SCAN_INTERVAL_MS);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError') {
        abort(new ScanError('Você precisa permitir o acesso à câmera para ler o QR code.'));
      } else if (name === 'NotFoundError') {
        abort(new ScanError('Não encontrei nenhuma câmera neste aparelho.'));
      } else {
        abort(new ScanError('Não consegui abrir a câmera.'));
      }
    }
  })();

  return {
    found,
    stop() {
      settle(null);
    },
  };
}
