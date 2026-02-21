import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  Chart,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  RadarController,
  PolarAreaController,
  ScatterController,
  BubbleController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Legend,
  Title,
  Tooltip,
  type ChartConfiguration,
  type ActiveElement,
  type ChartEvent,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  RadarController,
  PolarAreaController,
  ScatterController,
  BubbleController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Legend,
  Title,
  Tooltip
);

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
}

@customElement("a2ui-custom-chart")
export class InteractiveChart extends LitElement {
  // Properties set by A2UI root.ts during custom element instantiation
  @property({ attribute: false }) component: unknown = null;
  @property({ attribute: false }) processor: unknown = null;
  @property() surfaceId: string | null = null;
  @property() dataContextPath = "/";
  @property() weight: string | number = "initial";

  // Chart-specific properties (set from A2UI JSON component.properties)
  @property() chartType:
    | "bar"
    | "line"
    | "pie"
    | "doughnut"
    | "radar"
    | "polarArea"
    | "scatter"
    | "bubble" = "bar";
  @property({ attribute: false }) labels: string[] = [];
  @property({ attribute: false }) datasets: ChartDataset[] = [];
  @property() title = "";
  @property({ type: Boolean }) stacked = false;
  @property() indexAxis: "x" | "y" = "x";

  @state() private _hoveredPoint: string | null = null;

  private _chart: Chart | null = null;

  static styles = css`
    :host {
      display: block;
      flex: var(--weight);
      min-height: 0;
      width: 100%;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
      min-height: 250px;
      max-height: 450px;
    }

    canvas {
      width: 100% !important;
      cursor: pointer;
    }

    .hover-hint {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 12px;
      color: rgba(128, 128, 128, 0.7);
      pointer-events: none;
      transition: opacity 0.2s;
      font-family: var(--font-family, sans-serif);
    }
  `;

  render() {
    return html`
      <div class="chart-wrapper">
        <canvas id="chart-canvas"></canvas>
        <div class="hover-hint">
          ${this._hoveredPoint
            ? `Click to drill into: ${this._hoveredPoint}`
            : "Click any data point to drill down"}
        </div>
      </div>
    `;
  }

  private _buildChartConfig(): ChartConfiguration {
    const isPolar = ["pie", "doughnut", "polarArea", "radar"].includes(
      this.chartType
    );

    return {
      type: this.chartType as ChartConfiguration["type"],
      data: {
        labels: this.labels,
        datasets: this.datasets.map((ds) => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.backgroundColor ?? this._defaultColor(0.6),
          borderColor: ds.borderColor ?? this._defaultColor(1),
          borderWidth: ds.borderWidth ?? (isPolar ? 1 : 2),
          fill: ds.fill ?? (this.chartType === "radar"),
          tension: ds.tension ?? 0.3,
          pointRadius: ds.pointRadius ?? 5,
          pointHoverRadius: ds.pointHoverRadius ?? 8,
          pointHitRadius: 15,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: this.indexAxis,
        interaction: {
          mode: "nearest",
          intersect: false,
        },
        onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
          this._handleChartClick(elements);
        },
        onHover: (event: ChartEvent, elements: ActiveElement[]) => {
          const canvas = this._chart?.canvas;
          if (canvas) {
            canvas.style.cursor = elements.length > 0 ? "pointer" : "default";
          }
          if (elements.length > 0) {
            const el = elements[0];
            const label = this.labels[el.index] ?? `index ${el.index}`;
            const dsLabel = this.datasets[el.datasetIndex]?.label ?? "";
            this._hoveredPoint = dsLabel ? `${dsLabel} — ${label}` : label;
          } else {
            this._hoveredPoint = null;
          }
        },
        plugins: {
          title: {
            display: !!this.title,
            text: this.title,
            font: { size: 16 },
          },
          legend: {
            display: this.datasets.length > 1 || isPolar,
          },
          tooltip: {
            mode: "index" as const,
            intersect: false,
          },
        },
        scales: isPolar
          ? {}
          : {
              x: { stacked: this.stacked },
              y: { stacked: this.stacked, beginAtZero: true },
            },
      },
    };
  }

  private _defaultColor(alpha: number): string {
    return `rgba(129, 140, 248, ${alpha})`;
  }

  private _handleChartClick(elements: ActiveElement[]) {
    if (elements.length === 0) return;

    const el = elements[0];
    const datasetIndex = el.datasetIndex;
    const dataIndex = el.index;
    const dataset = this.datasets[datasetIndex];
    const label = this.labels[dataIndex] ?? `index ${dataIndex}`;
    const value = dataset?.data[dataIndex];
    const datasetLabel = dataset?.label ?? "";

    const actionContext = [
      {
        key: "chartType",
        value: { literalString: this.chartType },
      },
      {
        key: "datasetLabel",
        value: { literalString: datasetLabel },
      },
      {
        key: "label",
        value: { literalString: label },
      },
      {
        key: "value",
        value: { literalNumber: value },
      },
      {
        key: "datasetIndex",
        value: { literalNumber: datasetIndex },
      },
      {
        key: "dataIndex",
        value: { literalNumber: dataIndex },
      },
    ];

    const event = new CustomEvent("a2uiaction", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        eventType: "a2ui.action",
        action: {
          name: "chart_point_click",
          context: actionContext,
        },
        dataContextPath: this.dataContextPath,
        sourceComponentId: this.id,
        sourceComponent: this.component,
      },
    });

    this.dispatchEvent(event);
  }

  firstUpdated() {
    this._createChart();
  }

  updated(changed: Map<string, unknown>) {
    const chartProps = [
      "chartType",
      "labels",
      "datasets",
      "title",
      "stacked",
      "indexAxis",
    ];
    if (chartProps.some((p) => changed.has(p))) {
      this._createChart();
    }
  }

  private _createChart() {
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    const canvas = this.renderRoot.querySelector(
      "#chart-canvas"
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    if (!this.labels.length || !this.datasets.length) return;

    this._chart = new Chart(canvas, this._buildChartConfig());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }
}
