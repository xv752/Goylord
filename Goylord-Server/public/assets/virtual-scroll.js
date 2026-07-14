export class VirtualScroller {
  constructor(container, { itemHeight, renderItem, updateItem, gap = 8 }) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.updateItem = typeof updateItem === "function" ? updateItem : null;
    this.gap = gap;
    this.items = [];
    this.totalHeight = 0;
    this.startIndex = 0;
    this.endIndex = 0;
    this.buffer = 3;
    this._rafId = 0;

    this.spacerTop = document.createElement("div");
    this.spacerBottom = document.createElement("div");
    this.inner = document.createElement("div");
    this.inner.style.position = "relative";

    this.container.style.overflowY = "auto";
    this.container.style.position = "relative";
    this.container.appendChild(this.spacerTop);
    this.container.appendChild(this.inner);
    this.container.appendChild(this.spacerBottom);

    this.container.addEventListener("scroll", () => this._scheduleRender());
    this._resizeObserver = new ResizeObserver(() => this._scheduleRender());
    this._resizeObserver.observe(this.container);

    this._nodePool = new Map();
    this._nodeOrder = [];
  }

  setItems(items) {
    this.items = items;
    this.totalHeight = items.length * (this.itemHeight + this.gap);
    this.startIndex = -1;
    this.endIndex = -1;
    this._render();
  }

  _scheduleRender() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this._render();
    });
  }

  _schedulePrune(keepIds) {
    if (this._nodePool.size <= keepIds.size + 50) return;
    for (const [id, node] of this._nodePool) {
      if (!keepIds.has(id)) {
        node.remove();
        this._nodePool.delete(id);
      }
    }
    this._nodeOrder = this._nodeOrder.filter((id) => this._nodePool.has(id));
  }

  _patchItemData() {
    if (!this.updateItem) return;
    for (let i = this.startIndex; i < this.endIndex; i++) {
      const item = this.items[i];
      if (!item || !item.id) continue;
      const node = this._nodePool.get(item.id);
      if (!node) continue;
      try { this.updateItem(node, item); } catch {}
    }
  }

  _render() {
    const scrollTop = this.container.scrollTop;
    const viewHeight = this.container.clientHeight;

    const rawStart = Math.floor(scrollTop / (this.itemHeight + this.gap));
    const rawEnd = Math.ceil((scrollTop + viewHeight) / (this.itemHeight + this.gap));
    const startIndex = Math.max(0, rawStart - this.buffer);
    const endIndex = Math.min(this.items.length, rawEnd + this.buffer);

    if (startIndex === this.startIndex && endIndex === this.endIndex) {
      this._patchItemData();
      return;
    }
    this.startIndex = startIndex;
    this.endIndex = endIndex;

    this.spacerTop.style.height = (startIndex * (this.itemHeight + this.gap)) + "px";
    this.spacerBottom.style.height = Math.max(0, (this.items.length - endIndex) * (this.itemHeight + this.gap)) + "px";

    const visibleIds = new Set();
    const fragment = document.createDocumentFragment();
    let needsAppend = false;

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.items[i];
      if (!item || !item.id) continue;
      visibleIds.add(item.id);

      let node = this._nodePool.get(item.id);
      if (node) continue;

      const newNode = this.renderItem(item, i);
      if (!newNode) continue;
      newNode._vsItemId = item.id;
      this._nodePool.set(item.id, newNode);
      this._nodeOrder.push(item.id);
      fragment.appendChild(newNode);
      needsAppend = true;
    }

    for (let i = this._nodeOrder.length - 1; i >= 0; i--) {
      const id = this._nodeOrder[i];
      if (visibleIds.has(id)) continue;
      const node = this._nodePool.get(id);
      if (node && node.parentNode) node.remove();
    }

    if (needsAppend) {
      this.inner.appendChild(fragment);
    }

    this._patchItemData();

    if (this._nodePool.size > 200) {
      this._schedulePrune(visibleIds);
    }
  }

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    this._resizeObserver?.disconnect();
    this._nodePool.clear();
    this._nodeOrder = [];
    this.container.innerHTML = "";
  }
}
