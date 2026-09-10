/**
 * Serial Service for Web Serial API communication with Arduino Uno CH340G.
 *
 * REAL CONNECTION STATE MACHINE:
 *   DISCONNECTED
 *     → CONNECTING         (port selection dialog open)
 *     → PORT_OPEN          (port successfully opened, waiting for handshake)
 *     → CONNECTED          (ARDUINO_READY + PONG confirmed — truly online)
 *     → ERROR              (handshake timed out / unrecognized device)
 *   ← DISCONNECTED         (USB removed / port read error / explicit disconnect)
 *
 * arduinoConnected === true  ONLY when state is CONNECTED
 */

// ─── Public Types ────────────────────────────────────────────────────────────

export type ArduinoConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'PORT_OPEN'
  | 'CONNECTED'
  | 'ERROR';

export type SerialMessageHandler    = (message: string) => void;
export type ConnectionChangeHandler = (connected: boolean, portInfo?: string) => void;
export type StateChangeHandler      = (state: ArduinoConnectionState, portInfo?: string) => void;

// ─── Handshake Timeouts ──────────────────────────────────────────────────────

/** ms to wait for ARDUINO_READY after port opens before flagging ERROR */
const HANDSHAKE_TIMEOUT_MS = 6000;

// ─── Service Class ───────────────────────────────────────────────────────────

class SerialService {
  private port: any = null;
  private reader: any = null;
  private readableStreamClosed: Promise<void> | null = null;
  private isReading: boolean = false;
  private isConnecting: boolean = false;
  private baudRate: number = 9600;

  private connectionState: ArduinoConnectionState = 'DISCONNECTED';
  private currentPortInfo: string = '';
  private pongReceived: boolean = false;

  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  // Listeners
  private messageHandlers:    Set<SerialMessageHandler>    = new Set();
  private connectionHandlers: Set<ConnectionChangeHandler> = new Set();
  private stateHandlers:      Set<StateChangeHandler>      = new Set();

  constructor() {
    this.initNavigatorListeners();
  }

  // ─── Public Query API ───────────────────────────────────────────────────────

  /** True ONLY when handshake is fully confirmed (ARDUINO_READY + PONG). */
  public isConnected(): boolean {
    return this.connectionState === 'CONNECTED';
  }

  /** Whether the Web Serial API is available in this browser. */
  public isSupported(): boolean {
    return 'serial' in navigator;
  }

  /** Returns the current granular connection state string. */
  public getConnectionState(): ArduinoConnectionState {
    return this.connectionState;
  }

  /** Returns human-readable port info for the open port, or null. */
  public getPortInfo(): string | null {
    if (!this.port) return null;
    try {
      const info = this.port.getInfo ? this.port.getInfo() : null;
      if (info && (info.usbVendorId || info.usbProductId)) {
        // 0x1A86 / 6790 = Nanjing Qinheng Microelectronics — CH340G chip
        const isCH340 = info.usbVendorId === 0x1A86 || info.usbVendorId === 6790;
        const chip    = isCH340 ? 'CH340G USB-Serial' : 'USB Serial Device';
        const vidHex  = info.usbVendorId  ? `0x${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}`  : 'Unknown';
        const pidHex  = info.usbProductId ? `0x${info.usbProductId.toString(16).toUpperCase().padStart(4, '0')}` : 'Unknown';
        return `${chip} (VID: ${vidHex}, PID: ${pidHex})`;
      }
    } catch (e) {
      console.warn('[SerialService] Error getting port info:', e);
    }
    return 'USB Serial COM Port';
  }

  // ─── Connection Control ─────────────────────────────────────────────────────

  /**
   * Auto-reconnect to a previously authorized port (silent, non-blocking).
   * Called once on app startup.
   */
  public async tryAutoConnect(baudRate: number = 9600): Promise<boolean> {
    if (!this.isSupported() || this.isConnected() || this.isConnecting) return false;
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        console.log('[SerialService] Found previously authorized port — reconnecting...');
        await this.openPort(ports[0], baudRate);
        return true;
      }
    } catch (err) {
      console.warn('[SerialService] Auto-connect error:', err);
    }
    return false;
  }

  /**
   * Show the browser's serial port picker and connect.
   * Rejects if the browser doesn't support Web Serial.
   */
  public async requestAndConnect(baudRate: number = 9600): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Serial is not supported in this browser. ' +
        'Please use a Chromium-based browser (Chrome or Edge).'
      );
    }
    if (this.isConnected()) return true;

    this.setConnectionState('CONNECTING');
    this.isConnecting = true;

    try {
      const selectedPort = await (navigator as any).serial.requestPort();
      await this.openPort(selectedPort, baudRate);
      return true;
    } catch (err: any) {
      this.isConnecting = false;
      if (err.name === 'NotFoundError') {
        // User cancelled the picker dialog — not an error
        this.setConnectionState('DISCONNECTED');
        return false;
      }
      console.error('[SerialService] Connection request error:', err);
      this.setConnectionState('ERROR', 'Connection failed');
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  /** Cleanly close the serial port. */
  public async disconnect(): Promise<void> {
    this.clearHandshakeTimers();
    this.isReading = false;

    if (this.reader) {
      try { await this.reader.cancel(); } catch {}
      this.reader = null;
    }

    if (this.readableStreamClosed) {
      try { await this.readableStreamClosed; } catch {}
      this.readableStreamClosed = null;
    }

    if (this.port) {
      try { await this.port.close(); } catch (err) {
        console.warn('[SerialService] Error closing port:', err);
      }
      this.port = null;
    }

    this.setConnectionState('DISCONNECTED', 'Manually disconnected');
  }

  /**
   * Send a command string to Arduino followed by a newline character.
   * Returns false when the port is not open.
   */
  public async sendCommand(command: string): Promise<boolean> {
    if (!this.port || !this.port.writable) {
      console.warn('[SerialService] Cannot send: port not writable or not connected.');
      return false;
    }
    try {
      const writer  = this.port.writable.getWriter();
      const encoder = new TextEncoder();
      const line    = command.endsWith('\n') ? command : command + '\n';
      await writer.write(encoder.encode(line));
      writer.releaseLock();
      console.log('[SerialService Tx]', command.trim());
      return true;
    } catch (err) {
      console.error('[SerialService] sendCommand error:', err);
      return false;
    }
  }

  // ─── Listener Subscriptions ─────────────────────────────────────────────────

  /** Subscribe to every raw line received from Arduino. Returns unsubscribe fn. */
  public onMessage(handler: SerialMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to legacy boolean connected/disconnected events.
   * Fires whenever the connection state changes to/from a "connected" state.
   */
  public onConnectionChange(handler: ConnectionChangeHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Subscribe to granular ArduinoConnectionState changes.
   * Use this for full real-time state machine feedback.
   */
  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  // ─── Private Internals ──────────────────────────────────────────────────────

  private initNavigatorListeners(): void {
    if (!this.isSupported()) return;

    (navigator as any).serial.addEventListener('connect', (_event: any) => {
      console.log('[SerialService] USB serial device plugged in (not yet opened).');
      // Do NOT set state to connected — the port must be opened & handshaked first
    });

    (navigator as any).serial.addEventListener('disconnect', (event: any) => {
      console.log('[SerialService] USB serial device physically removed:', event.target);
      if (this.port === event.target) {
        this.handleUnexpectedDisconnect('USB Device Unplugged');
      } else {
        // Even if it's a different port, update state immediately if we were
        // previously connected and now have no port
        this.setConnectionState('DISCONNECTED', 'USB Device Unplugged');
      }
    });
  }

  private async openPort(port: any, baudRate: number): Promise<void> {
    this.port     = port;
    this.baudRate = baudRate;
    this.pongReceived = false;

    try {
      await this.port.open({ baudRate: this.baudRate });
    } catch (err: any) {
      if (!err.message?.includes('already open')) {
        this.port = null;
        this.setConnectionState('ERROR', 'Failed to open port');
        throw err;
      }
    }

    this.currentPortInfo = this.getPortInfo() || 'COM Port';
    this.isReading = true;

    // Mark as PORT_OPEN — handshake not yet confirmed
    this.setConnectionState('PORT_OPEN', this.currentPortInfo);

    // Start handshake watchdog
    this.startHandshakeTimer();

    // Begin reading incoming lines
    this.startReadLoop();

    // Send initial PING to probe board
    setTimeout(() => {
      if (this.connectionState === 'PORT_OPEN') {
        console.log('[SerialService] Sending initial PING to Arduino...');
        this.sendCommand('PING');
      }
    }, 1200);

    // Send a 2nd PING retry at 2.5s if still waiting
    setTimeout(() => {
      if (this.connectionState === 'PORT_OPEN') {
        console.log('[SerialService] Retrying PING to Arduino...');
        this.sendCommand('PING');
      }
    }, 2500);
  }

  private startHandshakeTimer(): void {
    this.clearHandshakeTimers();
    this.handshakeTimer = setTimeout(() => {
      if (this.connectionState === 'PORT_OPEN') {
        console.warn('[SerialService] Handshake timeout — ARDUINO_READY not received in time.');
        this.setConnectionState('ERROR', 'Device not responding — check firmware');
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private clearHandshakeTimers(): void {
    if (this.handshakeTimer)  { clearTimeout(this.handshakeTimer);  this.handshakeTimer  = null; }
  }

  private async startReadLoop(): Promise<void> {
    let textDecoder: TextDecoderStream;
    try {
      textDecoder = new TextDecoderStream();
    } catch {
      textDecoder = new (window as any).TextDecoderStream();
    }

    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              this.handleIncomingLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SerialService] Read stream error / closed:', err);
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock(); } catch {}
        this.reader = null;
      }
      this.isReading = false;
      this.handleUnexpectedDisconnect('Read stream ended');
    }
  }

  private handleIncomingLine(line: string): void {
    console.log('[SerialService Rx]', line);

    // ── Handshake protocol ──────────────────────────────────────────────────

    // Step 1: VISIONGUARD_ARDUINO_READY or ARDUINO_READY — board booted & firmware running
    if (line.includes('VISIONGUARD_ARDUINO_READY') || line.includes('ARDUINO_READY')) {
      console.log('[SerialService] Arduino ready message received — setting state CONNECTED...');
      this.pongReceived = true;
      this.clearHandshakeTimers();
      this.setConnectionState('CONNECTED', this.currentPortInfo);
      this.sendCommand('PING');
    }

    // PONG — response to PING command
    else if (line === 'PONG') {
      this.pongReceived = true;
      this.clearHandshakeTimers();
      if (this.connectionState !== 'CONNECTED') {
        this.setConnectionState('CONNECTED', this.currentPortInfo);
      }
      console.log('[SerialService] ✅ PONG received — Arduino fully confirmed online.');
    }

    // ── Broadcast to all message subscribers ────────────────────────────────
    this.messageHandlers.forEach(handler => {
      try { handler(line); } catch (err) {
        console.error('[SerialService] Error in message handler:', err);
      }
    });
  }

  private handleUnexpectedDisconnect(reason: string): void {
    this.clearHandshakeTimers();
    if (this.connectionState !== 'DISCONNECTED') {
      this.port     = null;
      this.isReading = false;
      this.setConnectionState('DISCONNECTED', reason);
    }
  }

  private setConnectionState(newState: ArduinoConnectionState, portInfo?: string): void {
    const previousState = this.connectionState;
    this.connectionState = newState;

    console.log(`[SerialService] State: ${previousState} → ${newState}${portInfo ? ` (${portInfo})` : ''}`);

    // Notify granular state subscribers
    this.stateHandlers.forEach(handler => {
      try { handler(newState, portInfo); } catch (err) {
        console.error('[SerialService] Error in state handler:', err);
      }
    });

    // Derive and notify legacy boolean connection subscribers
    const isNowConnected = newState === 'CONNECTED';
    const wasConnected   = previousState === 'CONNECTED';

    if (isNowConnected !== wasConnected) {
      this.connectionHandlers.forEach(handler => {
        try {
          handler(isNowConnected, portInfo || this.currentPortInfo || undefined);
        } catch (err) {
          console.error('[SerialService] Error in connection change handler:', err);
        }
      });
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
export const serialService = new SerialService();
