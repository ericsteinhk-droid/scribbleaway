"""A before/after view.

Two modes:
  * single  - just show one image (used right after loading, before an edit)
  * compare - draw the 'after' image, overlay the 'before' image clipped to the
              left of a draggable vertical handle.
"""

from PySide6.QtCore import QRect, Qt
from PySide6.QtGui import QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import QWidget


class BeforeAfterView(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._before = None      # QPixmap
        self._after = None        # QPixmap
        self._compare = False
        self._fraction = 0.5      # handle position, 0..1 across the image
        self.setMinimumSize(480, 360)
        self.setMouseTracking(True)

    # -- public API ---------------------------------------------------------
    def clear(self):
        self._before = self._after = None
        self._compare = False
        self.update()

    def set_single(self, pixmap):
        self._before = self._after = pixmap
        self._compare = False
        self.update()

    def set_compare(self, before, after):
        self._before = before
        self._after = after
        self._compare = True
        self._fraction = 0.5
        self.update()

    # -- geometry helpers ---------------------------------------------------
    def _scaled(self, pixmap):
        return pixmap.scaled(self.size(), Qt.KeepAspectRatio,
                             Qt.SmoothTransformation)

    def _display_rect(self, scaled):
        ox = (self.width() - scaled.width()) // 2
        oy = (self.height() - scaled.height()) // 2
        return QRect(ox, oy, scaled.width(), scaled.height())

    # -- painting -----------------------------------------------------------
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#22262b"))
        if self._after is None:
            painter.setPen(QColor("#889"))
            painter.drawText(self.rect(), Qt.AlignCenter,
                             "Load an image to begin")
            return

        after_s = self._scaled(self._after)
        rect = self._display_rect(after_s)
        painter.drawPixmap(rect.topLeft(), after_s)

        if not self._compare or self._before is None:
            return

        before_s = self._scaled(self._before)
        split = int(rect.left() + self._fraction * rect.width())

        painter.save()
        painter.setClipRect(rect.left(), rect.top(),
                            max(0, split - rect.left()), rect.height())
        painter.drawPixmap(rect.topLeft(), before_s)
        painter.restore()

        # divider handle
        painter.setPen(QPen(QColor("white"), 2))
        painter.drawLine(split, rect.top(), split, rect.bottom())

        # corner labels
        painter.setFont(QFont("", 10, QFont.Bold))
        self._label(painter, "BEFORE", rect.left() + 8, rect.top() + 20)
        self._label(painter, "AFTER", rect.right() - 58, rect.top() + 20)

    def _label(self, painter, text, x, y):
        painter.setPen(QColor(0, 0, 0, 160))
        painter.drawText(x + 1, y + 1, text)
        painter.setPen(QColor("white"))
        painter.drawText(x, y, text)

    # -- interaction --------------------------------------------------------
    def mousePressEvent(self, event):
        self._update_fraction(event.position().x())

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.LeftButton:
            self._update_fraction(event.position().x())

    def _update_fraction(self, x):
        if not self._compare or self._after is None:
            return
        rect = self._display_rect(self._scaled(self._after))
        if rect.width() <= 0:
            return
        frac = (x - rect.left()) / rect.width()
        self._fraction = min(1.0, max(0.0, frac))
        self.update()
