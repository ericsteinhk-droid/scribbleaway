import os
import re
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import threading

from PIL import Image
from docx import Document
from docx.shared import Inches, Pt, Twips, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# Layout constants (all in EMU unless noted)
COL_W_EMU = 3_371_850       # column width in EMU
PAGE_W_DXA = 12240
PAGE_H_DXA = 15840
MARGIN_DXA = 720
TABLE_W_DXA = 10800
COL_W_DXA = 5310
GAP_DXA = 180
CAPTION_SPACE_BEFORE_DXA = 40
CAPTION_SPACE_AFTER_DXA = 80
CAPTION_FONT_SIZE = 8        # pt
CAPTION_FONT_NAME = "Arial"


def natural_sort_key(s):
    parts = re.split(r'(\d+)', s)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def set_cell_borders_none(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        border = OxmlElement(f'w:{side}')
        border.set(qn('w:val'), 'none')
        border.set(qn('w:sz'), '0')
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), 'FFFFFF')
        tcBorders.append(border)
    tcPr.append(tcBorders)


def set_cell_margins_zero(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for side in ('top', 'left', 'bottom', 'right'):
        mar = OxmlElement(f'w:{side}')
        mar.set(qn('w:w'), '0')
        mar.set(qn('w:type'), 'dxa')
        tcMar.append(mar)
    tcPr.append(tcMar)


def set_cell_width(cell, width_dxa):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcW = OxmlElement('w:tcW')
    tcW.set(qn('w:w'), str(width_dxa))
    tcW.set(qn('w:type'), 'dxa')
    tcPr.append(tcW)


def set_table_borders_none(table):
    tbl = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    tblBorders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        border = OxmlElement(f'w:{side}')
        border.set(qn('w:val'), 'none')
        border.set(qn('w:sz'), '0')
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), 'FFFFFF')
        tblBorders.append(border)
    tblPr.append(tblBorders)


def set_table_width(table):
    tbl = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    tblW = OxmlElement('w:tblW')
    tblW.set(qn('w:w'), str(TABLE_W_DXA))
    tblW.set(qn('w:type'), 'dxa')
    tblPr.append(tblW)


def set_column_widths(table):
    tbl = table._tbl
    tblGrid = OxmlElement('w:tblGrid')
    for w in (COL_W_DXA, COL_W_DXA):
        gridCol = OxmlElement('w:gridCol')
        gridCol.set(qn('w:w'), str(w))
        tblGrid.append(gridCol)
    tbl.insert(1, tblGrid)


def add_caption(cell, filename_no_ext):
    para = cell.add_paragraph()
    para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pPr = para._p.get_or_add_pPr()
    spacing = OxmlElement('w:spacing')
    spacing.set(qn('w:before'), str(CAPTION_SPACE_BEFORE_DXA))
    spacing.set(qn('w:after'), str(CAPTION_SPACE_AFTER_DXA))
    pPr.append(spacing)
    run = para.add_run(filename_no_ext)
    run.font.name = CAPTION_FONT_NAME
    run.font.size = Pt(CAPTION_FONT_SIZE)


def add_image_to_cell(cell, image_path, width_emu, height_emu):
    para = cell.paragraphs[0]
    run = para.add_run()
    run.add_picture(image_path, width=Inches(width_emu / 914400), height=Inches(height_emu / 914400))


def get_image_dims(path):
    with Image.open(path) as img:
        return img.width, img.height


def compute_row_sizes(row_images):
    """
    row_images: list of (path, natural_w, natural_h)
    Returns list of (final_w_emu, final_h_emu) for each image in the row.
    """
    if len(row_images) == 1:
        path, nat_w, nat_h = row_images[0]
        display_h = nat_h / nat_w * COL_W_EMU
        return [(COL_W_EMU, display_h)]

    # Step 2: scale each image to column width
    display_heights = []
    for path, nat_w, nat_h in row_images:
        display_h = nat_h / nat_w * COL_W_EMU
        display_heights.append(display_h)

    # Step 3: min height across row
    target_h = min(display_heights)

    # Step 4: re-scale each image so height = target_h
    result = []
    for (path, nat_w, nat_h), dh in zip(row_images, display_heights):
        final_w = target_h * nat_w / nat_h
        final_h = target_h
        result.append((final_w, final_h))
    return result


def build_contact_sheet(image_paths, output_path, per_page, progress_cb, status_cb):
    images = sorted(image_paths, key=lambda p: natural_sort_key(os.path.basename(p)))
    total = len(images)
    if total == 0:
        raise ValueError("No images found in the selected folder.")

    doc = Document()

    # Configure section
    section = doc.sections[0]
    section.page_width = Twips(PAGE_W_DXA)
    section.page_height = Twips(PAGE_H_DXA)
    section.top_margin = Twips(MARGIN_DXA)
    section.bottom_margin = Twips(MARGIN_DXA)
    section.left_margin = Twips(MARGIN_DXA)
    section.right_margin = Twips(MARGIN_DXA)

    rows_per_page = per_page // 2  # 2 or 3
    pages = [images[i:i + per_page] for i in range(0, total, per_page)]

    first_page = True
    processed = 0

    for page_idx, page_images in enumerate(pages):
        if not first_page:
            # Page break paragraph
            pb_para = doc.add_paragraph()
            pb_run = pb_para.add_run()
            br = OxmlElement('w:br')
            br.set(qn('w:type'), 'page')
            pb_run._r.append(br)
        first_page = False

        # Create table for this page
        table = doc.add_table(rows=rows_per_page * 2, cols=2)
        set_table_borders_none(table)
        set_table_width(table)
        set_column_widths(table)

        # Group page images into rows of 2
        rows_data = [page_images[i:i + 2] for i in range(0, len(page_images), 2)]

        for row_idx, row_imgs in enumerate(rows_data):
            # Read natural dims
            row_info = []
            for img_path in row_imgs:
                nat_w, nat_h = get_image_dims(img_path)
                row_info.append((img_path, nat_w, nat_h))

            sizes = compute_row_sizes(row_info)

            img_table_row = table.rows[row_idx * 2]
            cap_table_row = table.rows[row_idx * 2 + 1]

            for col_idx in range(2):
                img_cell = img_table_row.cells[col_idx]
                cap_cell = cap_table_row.cells[col_idx]

                set_cell_borders_none(img_cell)
                set_cell_margins_zero(img_cell)
                set_cell_width(img_cell, COL_W_DXA)

                set_cell_borders_none(cap_cell)
                set_cell_margins_zero(cap_cell)
                set_cell_width(cap_cell, COL_W_DXA)

                if col_idx < len(row_imgs):
                    img_path = row_imgs[col_idx]
                    final_w, final_h = sizes[col_idx]
                    add_image_to_cell(img_cell, img_path, final_w, final_h)
                    caption_text = os.path.splitext(os.path.basename(img_path))[0]
                    add_caption(cap_cell, caption_text)
                # else: filler cell — leave empty, borders/width already set

            processed += len(row_imgs)
            progress_cb(processed / total * 100)
            status_cb(f"Processing image {processed} of {total}...")

    doc.save(output_path)
    status_cb(f"Done! Saved to {output_path}")
    progress_cb(100)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Contact Sheet Builder")
        self.resizable(False, False)
        self._build_ui()

    def _build_ui(self):
        pad = dict(padx=10, pady=6)

        # Folder selection
        folder_frame = tk.LabelFrame(self, text="Image Folder")
        folder_frame.grid(row=0, column=0, columnspan=2, sticky="ew", **pad)

        self.folder_var = tk.StringVar()
        tk.Entry(folder_frame, textvariable=self.folder_var, width=50).grid(row=0, column=0, padx=5, pady=4)
        tk.Button(folder_frame, text="Browse...", command=self._browse_folder).grid(row=0, column=1, padx=5, pady=4)

        # Output file
        out_frame = tk.LabelFrame(self, text="Output File")
        out_frame.grid(row=1, column=0, columnspan=2, sticky="ew", **pad)

        self.output_var = tk.StringVar()
        tk.Entry(out_frame, textvariable=self.output_var, width=50).grid(row=0, column=0, padx=5, pady=4)
        tk.Button(out_frame, text="Save As...", command=self._browse_output).grid(row=0, column=1, padx=5, pady=4)

        # Per-page mode
        mode_frame = tk.LabelFrame(self, text="Photos per Page")
        mode_frame.grid(row=2, column=0, columnspan=2, sticky="ew", **pad)

        self.per_page_var = tk.IntVar(value=6)
        tk.Radiobutton(mode_frame, text="4 per page (2×2)", variable=self.per_page_var, value=4).grid(
            row=0, column=0, padx=10, pady=4, sticky="w")
        tk.Radiobutton(mode_frame, text="6 per page (2×3)", variable=self.per_page_var, value=6).grid(
            row=0, column=1, padx=10, pady=4, sticky="w")

        # Progress
        self.progress = ttk.Progressbar(self, length=400, mode="determinate")
        self.progress.grid(row=3, column=0, columnspan=2, **pad)

        self.status_var = tk.StringVar(value="Ready.")
        tk.Label(self, textvariable=self.status_var, anchor="w").grid(
            row=4, column=0, columnspan=2, sticky="ew", padx=10)

        # Generate button
        self.gen_btn = tk.Button(self, text="Generate Contact Sheet", command=self._generate, width=30)
        self.gen_btn.grid(row=5, column=0, columnspan=2, pady=10)

    def _browse_folder(self):
        folder = filedialog.askdirectory(title="Select Image Folder")
        if folder:
            self.folder_var.set(folder)

    def _browse_output(self):
        path = filedialog.asksaveasfilename(
            title="Save Contact Sheet As",
            defaultextension=".docx",
            filetypes=[("Word Document", "*.docx"), ("All Files", "*.*")]
        )
        if path:
            self.output_var.set(path)

    def _collect_images(self, folder):
        exts = {'.jpg', '.jpeg', '.png'}
        images = []
        for fname in os.listdir(folder):
            if os.path.splitext(fname)[1].lower() in exts:
                images.append(os.path.join(folder, fname))
        return images

    def _generate(self):
        folder = self.folder_var.get().strip()
        output = self.output_var.get().strip()
        per_page = self.per_page_var.get()

        if not folder:
            messagebox.showerror("Error", "Please select an image folder.")
            return
        if not os.path.isdir(folder):
            messagebox.showerror("Error", f"Folder not found:\n{folder}")
            return
        if not output:
            messagebox.showerror("Error", "Please specify an output file path.")
            return

        images = self._collect_images(folder)
        if not images:
            messagebox.showerror("Error", "No JPG or PNG images found in the selected folder.")
            return

        self.gen_btn.config(state="disabled")
        self.progress["value"] = 0
        self.status_var.set("Starting...")

        def run():
            try:
                build_contact_sheet(
                    images, output, per_page,
                    progress_cb=lambda v: self.after(0, lambda: self.progress.config(value=v)),
                    status_cb=lambda s: self.after(0, lambda: self.status_var.set(s))
                )
                self.after(0, lambda: messagebox.showinfo("Done", f"Contact sheet saved to:\n{output}"))
            except PermissionError:
                self.after(0, lambda: messagebox.showerror(
                    "Permission Error",
                    f"Cannot write to:\n{output}\n\nCheck that the file is not open in another program."
                ))
            except Exception as e:
                err = str(e)
                self.after(0, lambda: messagebox.showerror("Error", f"Failed to generate contact sheet:\n{err}"))
            finally:
                self.after(0, lambda: self.gen_btn.config(state="normal"))

        threading.Thread(target=run, daemon=True).start()


if __name__ == "__main__":
    app = App()
    app.mainloop()
