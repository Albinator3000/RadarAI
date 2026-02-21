import { SignalWatcher } from "@lit-labs/signals";
import { provide } from "@lit/context";
import { LitElement, html, css, nothing, unsafeCSS } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { v0_8 } from "@a2ui/lit";
import * as UI from "@a2ui/lit/ui";
import { InteractiveChart } from "./interactive-chart.js";

UI.componentRegistry.register("Chart", InteractiveChart as unknown as typeof HTMLElement);

// ─── Annotation types ───────────────────────────────────────────────

interface Annotation {
  id: number;
  paths: { x: number; y: number }[][];
  text: string;
  textPos: { x: number; y: number };
  color: string;
}

const ANNOTATION_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4",
];

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
function circledNum(n: number): string {
  return CIRCLED[n] ?? `(${n + 1})`;
}

const defaultTheme: v0_8.Types.Theme = {
  additionalStyles: {
    Button: {
      background: "linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)",
      boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
      padding: "12px 28px",
      color: "#fff",
    },
    Card: {
      background:
        "light-dark(rgba(255,255,255,0.85), rgba(30,41,59,0.85))",
      backdropFilter: "blur(10px)",
    },
    Text: {
      h1: {
        background: "linear-gradient(135deg, #818cf8, #a78bfa)",
        "-webkit-background-clip": "text",
        "background-clip": "text",
        "-webkit-text-fill-color": "transparent",
      },
      h2: {
        background: "linear-gradient(135deg, #818cf8, #a78bfa)",
        "-webkit-background-clip": "text",
        "background-clip": "text",
        "-webkit-text-fill-color": "transparent",
      },
      h3: {},
      h4: {},
      h5: {},
      body: {},
      caption: {},
    },
  },
  components: {
    AudioPlayer: {},
    Button: {
      "border-br-12": true,
      "border-bw-0": true,
      "layout-pt-2": true,
      "layout-pb-2": true,
      "layout-pl-3": true,
      "layout-pr-3": true,
    },
    Card: { "border-br-9": true, "layout-p-4": true, "color-bgc-n100": true },
    CheckBox: { element: {}, label: {}, container: {} },
    Column: { "layout-g-2": true },
    DateTimeInput: { container: {}, label: {}, element: {} },
    Divider: {},
    Image: {
      all: { "border-br-5": true, "layout-el-cv": true },
      avatar: { "is-avatar": true },
      header: {},
      icon: {},
      largeFeature: {},
      mediumFeature: {},
      smallFeature: {},
    },
    Icon: {},
    List: { "layout-g-4": true, "layout-p-2": true },
    Modal: { backdrop: {}, element: {} },
    MultipleChoice: { container: {}, label: {}, element: {} },
    Row: { "layout-g-4": true },
    Slider: { container: {}, label: {}, element: {} },
    Tabs: { container: {}, controls: { all: {}, selected: {} }, element: {} },
    Text: {
      all: { "layout-w-100": true, "layout-g-2": true },
      h1: {
        "typography-f-sf": true,
        "typography-w-400": true,
        "layout-m-0": true,
        "layout-p-0": true,
        "typography-sz-hs": true,
      },
      h2: {
        "typography-f-sf": true,
        "typography-w-400": true,
        "layout-m-0": true,
        "layout-p-0": true,
        "typography-sz-tl": true,
      },
      h3: {
        "typography-f-sf": true,
        "typography-w-400": true,
        "layout-m-0": true,
        "layout-p-0": true,
        "typography-sz-tl": true,
      },
      h4: {
        "typography-f-sf": true,
        "typography-w-400": true,
        "layout-m-0": true,
        "layout-p-0": true,
        "typography-sz-bl": true,
      },
      h5: {
        "typography-f-sf": true,
        "typography-w-400": true,
        "layout-m-0": true,
        "layout-p-0": true,
        "typography-sz-bm": true,
      },
      body: {},
      caption: {},
    },
    TextField: {
      container: {
        "typography-sz-bm": true,
        "layout-w-100": true,
        "layout-g-2": true,
      },
      label: { "layout-flx-0": true },
      element: {
        "typography-sz-bm": true,
        "layout-pt-2": true,
        "layout-pb-2": true,
        "layout-pl-3": true,
        "layout-pr-3": true,
        "border-br-2": true,
        "border-bw-1": true,
        "border-bs-s": true,
      },
    },
    Video: { "border-br-5": true, "layout-el-cv": true },
  },
  elements: {},
  markdown: {},
};

interface ChatTurn {
  id: string;
  userMessage: string;
  processor: ReturnType<typeof v0_8.Data.createSignalA2uiMessageProcessor>;
  done: boolean;
  error?: string;
}

const SESSION_ID = crypto.randomUUID();

@customElement("a2ui-chat-poc")
export class A2UIChatPoc extends SignalWatcher(LitElement) {
  @provide({ context: UI.Context.themeContext })
  theme: v0_8.Types.Theme = defaultTheme;

  @state()
  turns: ChatTurn[] = [];

  @state()
  inputValue = "";

  @state()
  sending = false;

  @state()
  private _annotating = false;

  @state()
  private _annotations: Annotation[] = [];

  @state()
  private _currentStroke: { x: number; y: number }[] = [];

  @state()
  private _isDrawing = false;

  @state()
  private _pendingTextPos: { x: number; y: number } | null = null;

  @state()
  private _pendingText = "";

  static styles = [
    unsafeCSS(v0_8.Styles.structuralStyles),
    css`
      * {
        box-sizing: border-box;
      }

      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-width: 720px;
        margin: 0 auto;
        font-family: var(--font-family);
        color: light-dark(var(--n-10), var(--n-90));
      }

      .chat-header {
        text-align: center;
        padding: 24px 16px 12px;
        flex-shrink: 0;
      }

      .chat-header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        background: linear-gradient(135deg, #818cf8, #a78bfa);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .chat-header p {
        margin: 8px 0 0;
        font-size: 14px;
        opacity: 0.6;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .turn {
        display: flex;
        flex-direction: column;
        gap: 12px;
        animation: fadeIn 0.4s ease;
      }

      .user-bubble {
        align-self: flex-end;
        background: linear-gradient(135deg, #818cf8, #a78bfa);
        color: white;
        padding: 12px 18px;
        border-radius: 18px 18px 4px 18px;
        max-width: 80%;
        font-size: 15px;
        line-height: 1.5;
        box-shadow: 0 2px 8px rgba(129, 140, 248, 0.3);
      }

      .assistant-response {
        align-self: flex-start;
        width: 100%;
        animation: slideUp 0.4s ease;
      }

      .loading-indicator {
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 18px;
        background: light-dark(
          rgba(255, 255, 255, 0.7),
          rgba(30, 41, 59, 0.7)
        );
        border-radius: 18px;
        backdrop-filter: blur(10px);
        font-size: 14px;
        opacity: 0.8;
      }

      .dot-loader {
        display: flex;
        gap: 4px;
      }

      .dot-loader span {
        width: 8px;
        height: 8px;
        background: #818cf8;
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out both;
      }

      .dot-loader span:nth-child(2) {
        animation-delay: 0.16s;
      }

      .dot-loader span:nth-child(3) {
        animation-delay: 0.32s;
      }

      .error-bubble {
        align-self: flex-start;
        background: light-dark(#fef2f2, #450a0a);
        color: light-dark(#991b1b, #fca5a5);
        border: 1px solid light-dark(#fecaca, #7f1d1d);
        padding: 12px 18px;
        border-radius: 18px;
        font-size: 14px;
        max-width: 80%;
      }

      .welcome {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        text-align: center;
        padding: 40px 20px;
        opacity: 0.7;
      }

      .welcome .icon {
        font-size: 48px;
        color: #818cf8;
      }

      .welcome p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        max-width: 360px;
      }

      .suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-top: 8px;
      }

      .suggestion {
        background: light-dark(
          rgba(255, 255, 255, 0.7),
          rgba(30, 41, 59, 0.7)
        );
        border: 1px solid
          light-dark(rgba(129, 140, 248, 0.3), rgba(129, 140, 248, 0.2));
        color: inherit;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        backdrop-filter: blur(10px);
        font-family: inherit;
      }

      .suggestion:hover {
        background: linear-gradient(
          135deg,
          rgba(129, 140, 248, 0.15),
          rgba(167, 139, 250, 0.15)
        );
        border-color: #818cf8;
      }

      .input-area {
        flex-shrink: 0;
        padding: 12px 16px 24px;
      }

      form {
        display: flex;
        gap: 10px;
        align-items: center;
        background: light-dark(
          rgba(255, 255, 255, 0.8),
          rgba(30, 41, 59, 0.8)
        );
        backdrop-filter: blur(10px);
        border-radius: 28px;
        padding: 6px 6px 6px 20px;
        border: 1px solid
          light-dark(rgba(129, 140, 248, 0.2), rgba(129, 140, 248, 0.15));
        transition: border-color 0.2s;
      }

      form:focus-within {
        border-color: #818cf8;
        box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.1);
      }

      input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 15px;
        font-family: inherit;
        color: inherit;
        outline: none;
        min-width: 0;
      }

      input::placeholder {
        opacity: 0.5;
      }

      button[type="submit"] {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: none;
        background: linear-gradient(135deg, #818cf8, #a78bfa);
        color: white;
        cursor: pointer;
        flex-shrink: 0;
        transition: opacity 0.2s, transform 0.2s;
      }

      button[type="submit"]:hover:not([disabled]) {
        transform: scale(1.05);
      }

      button[type="submit"][disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes bounce {
        0%,
        80%,
        100% {
          transform: scale(0);
        }
        40% {
          transform: scale(1);
        }
      }

      /* ─── Annotation Mode ──────────────────────────── */

      .annotation-toolbar {
        display: flex;
        gap: 8px;
        justify-content: center;
        padding: 8px 16px;
        flex-shrink: 0;
        background: light-dark(
          rgba(255, 255, 255, 0.9),
          rgba(30, 41, 59, 0.9)
        );
        backdrop-filter: blur(10px);
        border-bottom: 1px solid
          light-dark(rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.2));
        animation: fadeIn 0.2s ease;
      }

      .annotation-toolbar button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 16px;
        border: 1px solid
          light-dark(rgba(129, 140, 248, 0.3), rgba(129, 140, 248, 0.2));
        background: transparent;
        color: inherit;
        font-size: 13px;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s;
      }

      .annotation-toolbar button:hover {
        background: light-dark(
          rgba(129, 140, 248, 0.1),
          rgba(129, 140, 248, 0.15)
        );
      }

      .annotation-toolbar .done-btn {
        background: linear-gradient(135deg, #818cf8, #a78bfa);
        color: white;
        border-color: transparent;
      }

      .annotation-toolbar .badge {
        font-size: 12px;
        opacity: 0.6;
      }

      .annotation-canvas {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 10;
        cursor: crosshair;
        touch-action: none;
      }

      .annotation-text-input {
        position: absolute;
        z-index: 12;
        padding: 5px 10px;
        border-radius: 8px;
        border: 2px solid #ef4444;
        background: light-dark(
          rgba(255, 255, 255, 0.95),
          rgba(30, 41, 59, 0.95)
        );
        color: inherit;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        min-width: 140px;
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .annotate-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        flex-shrink: 0;
        transition: all 0.2s;
        opacity: 0.5;
      }

      .annotate-btn:hover {
        opacity: 1;
        background: light-dark(
          rgba(129, 140, 248, 0.1),
          rgba(129, 140, 248, 0.15)
        );
      }

      .annotate-btn.active {
        opacity: 1;
        color: #ef4444;
        background: light-dark(
          rgba(239, 68, 68, 0.1),
          rgba(239, 68, 68, 0.15)
        );
      }
    `,
  ];

  render() {
    return html`
      <div class="chat-header">
        <h1>RadarAI</h1>
        <p>Ask me anything &mdash; I'll visualize it live</p>
      </div>

      ${this._annotating ? this._renderAnnotationToolbar() : nothing}

      <div
        class="chat-messages"
        id="messages"
        style=${this._annotating ? "overflow:hidden;position:relative;" : ""}
      >
        ${this.turns.length === 0 ? this._renderWelcome() : nothing}
        ${repeat(
          this.turns,
          (t) => t.id,
          (turn) => this._renderTurn(turn)
        )}
        ${this._annotating
          ? html`
              <canvas
                class="annotation-canvas"
                id="annotation-canvas"
                @pointerdown=${this._onPointerDown}
                @pointermove=${this._onPointerMove}
                @pointerup=${this._onPointerUp}
              ></canvas>
              ${this._pendingTextPos
                ? html`
                    <input
                      class="annotation-text-input"
                      id="annotation-text-input"
                      style="left:${this._pendingTextPos.x}px;top:${this._pendingTextPos.y}px;border-color:${ANNOTATION_COLORS[this._annotations.length % ANNOTATION_COLORS.length]}"
                      .value=${this._pendingText}
                      @input=${(e: InputEvent) => {
                        this._pendingText = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      @keydown=${(e: KeyboardEvent) => {
                        if (e.key === "Enter") this._confirmAnnotation();
                        if (e.key === "Escape") this._cancelPendingAnnotation();
                      }}
                      placeholder="Type label, press Enter"
                    />
                  `
                : nothing}
            `
          : nothing}
      </div>

      <div class="input-area">
        <form @submit=${this._handleSubmit}>
          <input
            type="text"
            placeholder=${this._annotating
              ? "Type your question about the annotations..."
              : "Ask anything..."}
            .value=${this.inputValue}
            @input=${(e: InputEvent) => {
              this.inputValue = (e.target as HTMLInputElement).value;
            }}
            ?disabled=${this.sending}
            autocomplete="off"
          />
          <button
            type="button"
            class="annotate-btn ${this._annotating ? "active" : ""}"
            @click=${this._toggleAnnotate}
            title=${this._annotating ? "Exit annotation mode" : "Annotate the response"}
            ?disabled=${this.turns.length === 0}
          >
            <span class="g-icon">edit</span>
          </button>
          <button
            type="submit"
            ?disabled=${this.sending || !this.inputValue.trim()}
          >
            <span class="g-icon">send</span>
          </button>
        </form>
      </div>
    `;
  }

  private _renderWelcome() {
    const suggestions = [
      "Show quarterly revenue with a bar chart",
      "Compare team performance on a spider chart",
      "Build a company dashboard",
      "Design a booking form",
    ];

    return html`
      <div class="welcome">
        <span class="g-icon icon">chat</span>
        <p>
          Ask a question or describe what you'd like to see.
          I'll generate interactive charts and UI on the fly.
        </p>
        <div class="suggestions">
          ${suggestions.map(
            (s) => html`
              <button
                class="suggestion"
                @click=${() => this._sendMessage(s)}
              >
                ${s}
              </button>
            `
          )}
        </div>
      </div>
    `;
  }

  private _renderAnnotationToolbar() {
    return html`
      <div class="annotation-toolbar">
        <span class="badge">
          ${this._annotations.length > 0
            ? `${this._annotations.length} annotation${this._annotations.length > 1 ? "s" : ""}`
            : "Draw on the response to annotate"}
        </span>
        <button
          @click=${this._undoAnnotation}
          ?disabled=${this._annotations.length === 0}
        >
          <span class="g-icon" style="font-size:16px">undo</span> Undo
        </button>
        <button @click=${this._clearAnnotations}>
          <span class="g-icon" style="font-size:16px">delete</span> Clear
        </button>
        <button class="done-btn" @click=${this._toggleAnnotate}>
          <span class="g-icon" style="font-size:16px">check</span> Done
        </button>
      </div>
    `;
  }

  private _renderTurn(turn: ChatTurn) {
    return html`
      <div class="turn">
        <div class="user-bubble">${turn.userMessage}</div>
        ${!turn.done && !turn.error
          ? html`
              <div class="loading-indicator">
                <div class="dot-loader">
                  <span></span><span></span><span></span>
                </div>
                Generating response...
              </div>
            `
          : nothing}
        ${turn.error
          ? html`<div class="error-bubble">${turn.error}</div>`
          : nothing}
        ${turn.done ? this._renderSurfaces(turn) : nothing}
      </div>
    `;
  }

  private _renderSurfaces(turn: ChatTurn) {
    const surfaces = turn.processor.getSurfaces();
    if (surfaces.size === 0) return nothing;

    return html`
      <div class="assistant-response">
        ${repeat(
          surfaces,
          ([surfaceId]) => surfaceId,
          ([surfaceId, surface]) => html`
            <a2ui-surface
              .surfaceId=${surfaceId}
              .surface=${surface}
              .processor=${turn.processor}
              .enableCustomElements=${true}
              @a2uiaction=${(evt: v0_8.Events.StateEvent<"a2ui.action">) =>
                this._handleAction(evt, turn, surfaceId)}
            ></a2ui-surface>
          `
        )}
      </div>
    `;
  }

  private async _handleAction(
    evt: v0_8.Events.StateEvent<"a2ui.action">,
    turn: ChatTurn,
    surfaceId: string
  ) {
    const [target] = evt.composedPath();
    if (!(target instanceof HTMLElement)) return;

    const context: Record<string, unknown> = {};
    if (evt.detail.action.context) {
      for (const item of evt.detail.action.context) {
        if (item.value.literalString !== undefined) {
          context[item.key] = item.value.literalString;
        } else if (item.value.literalNumber !== undefined) {
          context[item.key] = item.value.literalNumber;
        } else if (item.value.literalBoolean !== undefined) {
          context[item.key] = item.value.literalBoolean;
        } else if (item.value.path) {
          const path = turn.processor.resolvePath(
            item.value.path,
            evt.detail.dataContextPath
          );
          context[item.key] = turn.processor.getData(
            evt.detail.sourceComponent!,
            path,
            surfaceId
          );
        }
      }
    }

    const actionName = evt.detail.action.name;

    if (actionName === "chart_point_click") {
      const dsLabel = context.datasetLabel ?? "";
      const label = context.label ?? "";
      const value = context.value ?? "";
      this.inputValue = `[${dsLabel} — ${label}: ${value}] `;
      this._focusInput();
      return;
    }

    const message = `User clicked "${actionName}" with context: ${JSON.stringify(context)}`;
    await this._sendMessage(message);
  }

  // ─── Annotation methods ───────────────────────────────────────

  private async _toggleAnnotate() {
    this._annotating = !this._annotating;
    if (this._annotating) {
      await this.updateComplete;
      this._setupAnnotationCanvas();
    } else {
      this._annotations = [];
      this._currentStroke = [];
      this._pendingTextPos = null;
      this._pendingText = "";
      this._isDrawing = false;
    }
  }

  private _setupAnnotationCanvas() {
    const canvas = this.renderRoot.querySelector(
      "#annotation-canvas"
    ) as HTMLCanvasElement | null;
    const container = this.renderRoot.querySelector(
      "#messages"
    ) as HTMLElement | null;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
  }

  private _getPointerPos(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _onPointerDown(e: PointerEvent) {
    if (this._pendingTextPos) return;
    this._isDrawing = true;
    this._currentStroke = [this._getPointerPos(e)];
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  private _onPointerMove(e: PointerEvent) {
    if (!this._isDrawing) return;
    this._currentStroke = [...this._currentStroke, this._getPointerPos(e)];
    this._repaintCanvas();
  }

  private _onPointerUp(e: PointerEvent) {
    if (!this._isDrawing) return;
    this._isDrawing = false;
    if (this._currentStroke.length < 3) {
      this._currentStroke = [];
      this._repaintCanvas();
      return;
    }
    const last = this._currentStroke[this._currentStroke.length - 1];
    this._pendingTextPos = { x: last.x + 12, y: last.y - 8 };
    this._pendingText = "";
    this._repaintCanvas();
    requestAnimationFrame(() => {
      const input = this.renderRoot.querySelector(
        "#annotation-text-input"
      ) as HTMLInputElement | null;
      input?.focus();
    });
  }

  private _confirmAnnotation() {
    if (!this._pendingTextPos) return;
    const color =
      ANNOTATION_COLORS[this._annotations.length % ANNOTATION_COLORS.length];
    const annotation: Annotation = {
      id: this._annotations.length,
      paths: [this._currentStroke],
      text: this._pendingText || `annotation ${this._annotations.length + 1}`,
      textPos: this._pendingTextPos,
      color,
    };
    this._annotations = [...this._annotations, annotation];
    this._currentStroke = [];
    this._pendingTextPos = null;
    this._pendingText = "";
    this._repaintCanvas();
  }

  private _cancelPendingAnnotation() {
    this._currentStroke = [];
    this._pendingTextPos = null;
    this._pendingText = "";
    this._repaintCanvas();
  }

  private _undoAnnotation() {
    if (this._annotations.length === 0) return;
    this._annotations = this._annotations.slice(0, -1);
    this._repaintCanvas();
  }

  private _clearAnnotations() {
    this._annotations = [];
    this._currentStroke = [];
    this._pendingTextPos = null;
    this._pendingText = "";
    this._repaintCanvas();
  }

  private _repaintCanvas() {
    const canvas = this.renderRoot.querySelector(
      "#annotation-canvas"
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    for (const ann of this._annotations) {
      this._drawStroke(ctx, ann.paths[0], ann.color);
      const badge = `${circledNum(ann.id)} ${ann.text}`;
      this._drawLabel(ctx, badge, ann.textPos, ann.color);
    }

    if (this._currentStroke.length > 1) {
      const color =
        ANNOTATION_COLORS[this._annotations.length % ANNOTATION_COLORS.length];
      this._drawStroke(ctx, this._currentStroke, color);
    }
  }

  private _drawStroke(
    ctx: CanvasRenderingContext2D,
    path: { x: number; y: number }[],
    color: string
  ) {
    if (path.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
  }

  private _drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    pos: { x: number; y: number },
    color: string
  ) {
    ctx.font = "bold 14px sans-serif";
    const metrics = ctx.measureText(text);
    const pad = 4;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(
      pos.x - pad,
      pos.y - 14,
      metrics.width + pad * 2,
      18 + pad
    );
    ctx.fillStyle = color;
    ctx.fillText(text, pos.x, pos.y);
  }

  private async _captureAnnotatedImage(): Promise<string | null> {
    const annotationCanvas = this.renderRoot.querySelector(
      "#annotation-canvas"
    ) as HTMLCanvasElement | null;
    const messagesEl = this.renderRoot.querySelector(
      "#messages"
    ) as HTMLElement | null;
    if (!annotationCanvas || !messagesEl) return null;

    const dpr = window.devicePixelRatio || 1;
    const w = annotationCanvas.width / dpr;
    const h = annotationCanvas.height / dpr;

    const composite = document.createElement("canvas");
    composite.width = annotationCanvas.width;
    composite.height = annotationCanvas.height;
    const ctx = composite.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const containerRect = messagesEl.getBoundingClientRect();

    const surfaces = this.renderRoot.querySelectorAll("a2ui-surface");
    for (const surface of surfaces) {
      const root = surface.shadowRoot?.querySelector("a2ui-root");
      if (!root) continue;
      const charts = root.querySelectorAll("a2ui-custom-chart");
      for (const chart of charts) {
        const innerCanvas = chart.shadowRoot?.querySelector(
          "#chart-canvas"
        ) as HTMLCanvasElement | null;
        if (!innerCanvas) continue;
        const chartRect = innerCanvas.getBoundingClientRect();
        const x = chartRect.left - containerRect.left;
        const y = chartRect.top - containerRect.top;
        ctx.drawImage(innerCanvas, x, y, chartRect.width, chartRect.height);
      }
    }

    ctx.drawImage(annotationCanvas, 0, 0, w, h);

    return composite
      .toDataURL("image/png")
      .replace(/^data:image\/png;base64,/, "");
  }

  private _focusInput() {
    requestAnimationFrame(() => {
      const input = this.renderRoot.querySelector("input") as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    const userQuestion = this.inputValue.trim();
    if (!userQuestion || this.sending) return;

    if (this._annotating && this._annotations.length > 0) {
      const annDescs = this._annotations
        .map((a) => `${circledNum(a.id)} (${a.color}) "${a.text}"`)
        .join("\n");
      const apiMessage =
        `The user annotated the previous response with numbered circles and labels:\n${annDescs}\n\nUser's question: ${userQuestion}`;
      const displayDescs = this._annotations
        .map((a) => `${circledNum(a.id)} "${a.text}"`)
        .join(", ");
      const displayMessage = `✏️ ${displayDescs} — ${userQuestion}`;
      const image = await this._captureAnnotatedImage();

      this._annotating = false;
      this._annotations = [];
      this._currentStroke = [];
      this._pendingTextPos = null;
      this._pendingText = "";

      await this._sendMessage(apiMessage, image ?? undefined, displayMessage);
    } else {
      await this._sendMessage(userQuestion);
    }
  }

  private async _sendMessage(
    message: string,
    imageBase64?: string,
    displayMessage?: string
  ) {
    this.inputValue = "";
    this.sending = true;

    const turn: ChatTurn = {
      id: crypto.randomUUID(),
      userMessage: displayMessage ?? message,
      processor: v0_8.Data.createSignalA2uiMessageProcessor(),
      done: false,
    };

    this.turns = [...this.turns, turn];
    this._scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId: SESSION_ID,
          image: imageBase64,
        }),
      });

      const data = await res.json();

      if (data.error) {
        turn.error = data.error;
      } else if (data.messages?.length) {
        turn.processor.processMessages(data.messages);
        turn.done = true;
      } else {
        turn.error = "No UI response received.";
      }
    } catch (err) {
      turn.error =
        err instanceof Error ? err.message : "Failed to reach the server.";
    } finally {
      this.sending = false;
      this.turns = [...this.turns];
      this._scrollToBottom();
    }
  }

  private _scrollToBottom() {
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector("#messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
