document.addEventListener('DOMContentLoaded', function () {
  for (var elm of document.querySelectorAll(".DragToScroll")) {
    elm.style.cursor = 'grab';

    let pos = { top: 0, left: 0, x: 0, y: 0 };

    const mouseDownHandler = function(e) {
      elm.style.cursor = 'grabbing';
      elm.style.userSelect = 'none';

      pos = {
        left: elm.scrollLeft,
        top: elm.scrollTop,
        x: e.clientX,
        y: e.clientY,
      };

      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    };

    const mouseMoveHandler = function(e) {
      // How far the mouse has been moved
      const dx = e.clientX - pos.x;
      const dy = e.clientY - pos.y;

      // Scroll the element
      elm.scrollTop = pos.top - dy;
      elm.scrollLeft = pos.left - dx;
    };

    const mouseUpHandler = function() {
      elm.style.cursor = 'grab';
      elm.style.removeProperty('user-select');

      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };

    // Attach the handler
    elm.addEventListener('mousedown', mouseDownHandler);
  }
});