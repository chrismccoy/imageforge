/**
 * Edit page geometry
 */
window.ImageForgeEditGeometry = (function () {
  "use strict";

  /**
   * A pointer event's position as a pixel on the full-size canvas.
   */
  function toCanvasPoint(event, rect, naturalWidth, naturalHeight) {
    const xRatio = rect.width ? naturalWidth / rect.width : 1;
    const yRatio = rect.height ? naturalHeight / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * xRatio,
      y: (event.clientY - rect.top) * yRatio,
    };
  }

  /**
   * A brush width in displayed pixels, as a width on the full-size canvas.
   */
  function toCanvasBrush(width, rect, naturalWidth) {
    return rect.width ? width * (naturalWidth / rect.width) : width;
  }

  const ZOOM_LEVELS = ["fit", 1, 2, 4];

  /**
   * How wide the stage should be at a zoom level, or null to leave it to the
   * stylesheet.
   */
  function zoomWidth(level, naturalWidth) {
    if (level === "fit") return null;
    const width = Number(naturalWidth);
    if (!Number.isFinite(width) || width <= 0) return null;
    return width * level;
  }

  /**
   * A zoom level as it reads on the button between − and +.
   */
  function zoomLabel(level) {
    return level === "fit" ? "Fit" : Math.round(level * 100) + "%";
  }

  /**
   * Where the scroll has to move to so a zoom keeps the middle in the middle.
   */
  function recentre(scroll, viewportSize, oldContentSize, newContentSize) {
    if (!(oldContentSize > 0)) return 0;
    const middle = (scroll + viewportSize / 2) / oldContentSize;
    const wanted = middle * newContentSize - viewportSize / 2;
    const most = Math.max(0, newContentSize - viewportSize);
    return Math.min(most, Math.max(0, wanted));
  }

  /**
   * Set the stage's width and put the scroll back where it belongs.
   */
  function zoomStage(view, width) {
    const before = view.read();
    view.setWidth(width);
    const after = view.read();

    view.setScroll(
      recentre(before.scrollLeft, before.clientWidth, before.width, after.width),
      recentre(before.scrollTop, before.clientHeight, before.height, after.height)
    );
  }

  /**
   * The point between
   */
  function centreOf(points) {
    if (!points.length) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    points.forEach(function (point) {
      x += point.x;
      y += point.y;
    });
    return { x: x / points.length, y: y / points.length };
  }

  /**
   * Where the box should be scrolled to after
   */
  function panBy(scroll, from, to) {
    return {
      left: Math.max(0, scroll.left - (to.x - from.x)),
      top: Math.max(0, scroll.top - (to.y - from.y)),
    };
  }

  /**
   * Record going down, and say whether this is now a pan.
   */
  function noteTouch(touches, event) {
    if (event.isPrimary) touches.clear();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    return touches.size > 1;
  }

  return {
    toCanvasPoint,
    toCanvasBrush,
    ZOOM_LEVELS,
    zoomWidth,
    zoomLabel,
    recentre,
    zoomStage,
    centreOf,
    panBy,
    noteTouch,
  };
})();
