#!/usr/bin/env python3
"""
Analyseur de Rapports d'Heures — Architecture EVOQ
Application hors-ligne pour la protection des données confidentielles.

Correction v2 : regroupement par semaine ISO calendaire réelle.
Certains rapports couvrent 2 semaines ; la version précédente attribuait
toutes les heures à une seule semaine, ce qui gonflait artificiellement
les totaux. Désormais chaque entrée est attribuée à sa semaine ISO réelle.

Dépendances : pandas, openpyxl, matplotlib
Python 3.8+, tkinter inclus dans la distribution standard.
"""

import os
import re
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from datetime import datetime, timedelta
from collections import defaultdict

import pandas as pd
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk

# ─── Palette cohérente avec les graphiques du projet ──────────────────────────
COLORS = [
    '#8884d8','#82ca9d','#ff7300','#0088fe','#ff0000',
    '#00C49F','#FFBB28','#FF8042','#a4de6c','#d0ed57',
    '#8dd1e1','#c084fc','#fb923c','#34d399','#f472b6',
]
DARK  = '#1a1a2e'
ACCENT= '#4361ee'
TEAL  = '#2ec4b6'
DANGER= '#ef233c'
LIGHT = '#f5f7ff'
WHITE = '#ffffff'
MUTED = '#aaaacc'
PURPLE= '#6366f1'


# ═══════════════════════════════════════════════════════════════════════════════
#  LOGIQUE DE TRAITEMENT
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_date(date_str: str):
    """Convertit MM/DD/YYYY ou YYYY-MM-DD en objet datetime."""
    try:
        if len(date_str) == 10 and date_str[4] == '-':
            return datetime.strptime(date_str, '%Y-%m-%d')
        else:
            return datetime.strptime(date_str, '%m/%d/%Y')
    except ValueError:
        return None


def parse_entries_by_week(filepath: str, seen: set = None) -> dict:
    """
    Parse un rapport XLSX et regroupe les heures par SEMAINE ISO réelle.

    Certains rapports couvrent 2 semaines (ex. 12 jours ouvrables). En
    regroupant par semaine ISO, on évite d'attribuer 2 semaines de travail
    à une seule colonne du tableau.

    Retourne : {'YYYY-Www': {code: {'name': ..., 'hours': float}}}
    """
    try:
        df = pd.read_excel(filepath, sheet_name=0, header=None)
    except Exception as e:
        raise RuntimeError(f"Impossible de lire {os.path.basename(filepath)}: {e}")

    # Clé de déduplication : (projet, code, phase, date, heures)
    # La phase est incluse pour ne pas écraser des entrées légitimes où un employé
    # a le même nombre d'heures sur la même date mais dans des phases différentes.
    # Le `seen` partagé entre fichiers évite le double-comptage inter-rapports.
    phase_hdr = re.compile(r'Phase Number:\s*(\d+\.\d+)')
    entry_pat = re.compile(
        r'^([A-Z0-9]{3}-\d{3})\s+(?:B\s+)?(E[A-Z]{3,6})\s+'
        r'([\w\-][\w\-\s]*,\s*[\w\-\s]+?)\s{4,}'
        r'(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})'
    )

    weeks_data: dict = defaultdict(dict)
    if seen is None:
        seen = set()
    current_phase = '__'

    for _, row in df.iterrows():
        cell = str(row[0]).strip() if pd.notna(row[0]) else ''
        ph = phase_hdr.search(cell)
        if ph:
            current_phase = ph.group(1)
            continue
        m = entry_pat.match(cell)
        if not m:
            continue
        proj, code, name, date_str = m.group(1), m.group(2), m.group(3).strip(), m.group(4)
        try:
            hours = float(row[3]) if pd.notna(row[3]) else 0.0
        except (ValueError, TypeError):
            hours = 0.0

        dedup_key = (proj, code, current_phase, date_str, hours)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        dt = _parse_date(date_str)
        if dt is None:
            continue

        iso      = dt.isocalendar()
        week_key = f'{iso[0]}-W{iso[1]:02d}'

        if code not in weeks_data[week_key]:
            weeks_data[week_key][code] = {'name': name, 'hours': 0.0}
        weeks_data[week_key][code]['hours'] += hours

    return dict(weeks_data)


def _week_label(week_key: str) -> str:
    """'YYYY-Www' → 'JJ-MM-AA' (lundi de la semaine)."""
    year, week = int(week_key[:4]), int(week_key[6:])
    monday = datetime.fromisocalendar(year, week, 1)
    return monday.strftime('%d-%m-%y')


def _expand_week_range(sorted_keys: list) -> list:
    """Return every ISO week key between the first and last entry.

    Without this, weeks with no hours (vacations, holidays) are absent from
    sorted_keys and the chart draws a straight line across the gap instead of
    showing a visible drop to zero.
    """
    if not sorted_keys:
        return []
    yr0, wn0 = int(sorted_keys[0][:4]),  int(sorted_keys[0][6:])
    yr1, wn1 = int(sorted_keys[-1][:4]), int(sorted_keys[-1][6:])
    current  = datetime.fromisocalendar(yr0, wn0, 1)
    end      = datetime.fromisocalendar(yr1, wn1, 1)
    result   = []
    while current <= end:
        iso = current.isocalendar()
        result.append(f'{iso[0]}-W{iso[1]:02d}')
        current += timedelta(weeks=1)
    return result


def process_files(filepaths: list, min_avg_hours: float = 3.0) -> tuple:
    """
    Traite tous les fichiers et construit la matrice heures × semaines ISO.

    Retourne :
        weeks         : labels des semaines (lundi de chaque semaine ISO)
        employee_data : {code: {name, hours_per_week, total, avg, active_weeks}}
        errors        : messages d'erreur par fichier
    """
    # Agrégation : week_key ISO → code → {name, hours}
    all_weeks: dict = defaultdict(dict)
    errors: list    = []

    seen_global: set = set()  # partagé entre tous les fichiers
    for fp in filepaths:
        try:
            file_weeks = parse_entries_by_week(fp, seen=seen_global)
        except RuntimeError as e:
            errors.append(str(e))
            continue
        for week_key, emp_data in file_weeks.items():
            for code, info in emp_data.items():
                if code not in all_weeks[week_key]:
                    all_weeks[week_key][code] = {'name': info['name'], 'hours': 0.0}
                all_weeks[week_key][code]['hours'] += info['hours']

    # Toutes les semaines ISO consécutives entre la première et la dernière.
    # Les semaines sans données (congés, Noël…) apparaissent à zéro plutôt
    # qu'être sautées, ce qui évite de relier les points à travers la pause.
    sorted_keys   = _expand_week_range(sorted(all_weeks.keys()))
    week_labels   = [_week_label(k) for k in sorted_keys]

    # Collecte de tous les employés (nom le plus récent retenu)
    all_employees: dict = {}
    for wk in sorted_keys:
        for code, info in all_weeks[wk].items():
            all_employees[code] = info['name']

    # Matrice d'heures
    employee_stats: dict = {}
    for code, name in all_employees.items():
        hours_pw = [all_weeks[wk].get(code, {}).get('hours', 0.0) for wk in sorted_keys]
        total    = sum(hours_pw)
        non_zero = [h for h in hours_pw if h > 0]
        avg      = sum(non_zero) / len(non_zero) if non_zero else 0.0
        employee_stats[code] = {
            'name': name,
            'hours_per_week': hours_pw,
            'total': total,
            'avg': avg,
            'active_weeks': len(non_zero),
        }

    filtered = {
        code: s for code, s in employee_stats.items()
        if s['avg'] >= min_avg_hours
    }

    return week_labels, filtered, errors


# ═══════════════════════════════════════════════════════════════════════════════
#  INTERFACE GRAPHIQUE
# ═══════════════════════════════════════════════════════════════════════════════

class Tooltip:
    def __init__(self, widget, text):
        self.widget = widget; self.text = text; self.tip = None
        widget.bind('<Enter>', self.show)
        widget.bind('<Leave>', self.hide)

    def show(self, _=None):
        x = self.widget.winfo_rootx() + 20
        y = self.widget.winfo_rooty() + 20
        self.tip = tk.Toplevel(self.widget)
        self.tip.wm_overrideredirect(True)
        self.tip.wm_geometry(f'+{x}+{y}')
        tk.Label(self.tip, text=self.text, background='#ffffe0',
                 relief='solid', borderwidth=1, font=('Helvetica', 9),
                 padx=5, pady=3).pack()

    def hide(self, _=None):
        if self.tip:
            self.tip.destroy(); self.tip = None


class HoursAnalyzerApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Analyseur de Rapports d'Heures — Architecture EVOQ")
        self.geometry('1300x820')
        self.minsize(900, 600)
        self.configure(bg=LIGHT)
        self.files: list         = []
        self.weeks: list         = []
        self.employee_data: dict = {}
        self.min_avg_var         = tk.DoubleVar(value=3.0)
        self._apply_styles()
        self._build_ui()

    # ── Styles ───────────────────────────────────────────────────────────────

    def _apply_styles(self):
        s = ttk.Style(self)
        s.theme_use('clam')
        s.configure('TNotebook',        background=LIGHT,    borderwidth=0)
        s.configure('TNotebook.Tab',    background='#dde3ff', foreground='#333',
                    padding=[12, 6],    font=('Helvetica', 10))
        s.map('TNotebook.Tab',          background=[('selected', WHITE)])
        s.configure('Treeview',         background=WHITE,    fieldbackground=WHITE,
                    rowheight=24,       font=('Helvetica', 9))
        s.configure('Treeview.Heading', background='#dde3ff', foreground=DARK,
                    font=('Helvetica', 9, 'bold'))
        s.map('Treeview',               background=[('selected', ACCENT)],
                                         foreground=[('selected', WHITE)])

    # ── Construction UI ───────────────────────────────────────────────────────

    def _build_ui(self):
        header = tk.Frame(self, bg=DARK, height=64)
        header.pack(fill='x')
        header.pack_propagate(False)
        tk.Label(header, text="⏱  Analyseur de Rapports d'Heures",
                 font=('Helvetica', 17, 'bold'), bg=DARK, fg=WHITE
                 ).pack(side='left', padx=20, pady=16)
        tk.Label(header, text='🔒  Traitement 100 % local — aucune donnée transmise',
                 font=('Helvetica', 9), bg=DARK, fg=MUTED
                 ).pack(side='right', padx=20)

        body = tk.Frame(self, bg=LIGHT)
        body.pack(fill='both', expand=True, padx=12, pady=10)

        left = tk.Frame(body, bg=WHITE, width=270, relief='groove', bd=1)
        left.pack(side='left', fill='y', padx=(0, 10))
        left.pack_propagate(False)
        self._build_left_panel(left)

        right = tk.Frame(body, bg=LIGHT)
        right.pack(side='left', fill='both', expand=True)
        self._build_right_panel(right)

        self.status_var = tk.StringVar(
            value='Sélectionnez des fichiers XLSX et cliquez sur Analyser.')
        tk.Label(self, textvariable=self.status_var, bg=DARK, fg=MUTED,
                 font=('Helvetica', 9), anchor='w', padx=10
                 ).pack(fill='x', side='bottom')

    def _btn(self, parent, text, cmd, bg, **kw):
        return tk.Button(parent, text=text, command=cmd, bg=bg, fg=WHITE,
                         font=('Helvetica', 10, 'bold'), relief='flat',
                         cursor='hand2', activebackground=bg,
                         activeforeground=WHITE, **kw)

    def _build_left_panel(self, parent):
        tk.Label(parent, text='Fichiers rapports XLSX', bg=WHITE,
                 font=('Helvetica', 11, 'bold'), fg=DARK
                 ).pack(pady=(14, 6), padx=12, anchor='w')

        btn_area = tk.Frame(parent, bg=WHITE)
        btn_area.pack(fill='x', padx=10)
        self._btn(btn_area, '➕  Ajouter fichiers', self._add_files,
                  ACCENT, padx=8, pady=6).pack(fill='x', pady=2)
        self._btn(btn_area, '🗑  Effacer la liste', self._clear_files,
                  DANGER, padx=8, pady=5).pack(fill='x', pady=2)

        tk.Label(parent, text='Fichiers sélectionnés :', bg=WHITE,
                 font=('Helvetica', 9, 'italic'), fg='#666'
                 ).pack(anchor='w', padx=12, pady=(8, 2))

        list_frame = tk.Frame(parent, bg=WHITE)
        list_frame.pack(fill='both', expand=True, padx=10)
        sb = ttk.Scrollbar(list_frame)
        sb.pack(side='right', fill='y')
        self.file_listbox = tk.Listbox(
            list_frame, font=('Courier', 8), bg='#f0f2ff',
            relief='flat', bd=0, selectbackground=ACCENT,
            yscrollcommand=sb.set)
        self.file_listbox.pack(fill='both', expand=True)
        sb.config(command=self.file_listbox.yview)

        params = tk.LabelFrame(parent, text=' Paramètres ', bg=WHITE,
                               fg='#555', font=('Helvetica', 9))
        params.pack(fill='x', padx=10, pady=10)
        tk.Label(params, text='Moyenne min. incluse (h/semaine) :',
                 bg=WHITE, font=('Helvetica', 9), fg='#333'
                 ).pack(anchor='w', padx=8, pady=(6, 0))
        spin = tk.Spinbox(params, from_=0, to=40, increment=0.5,
                          textvariable=self.min_avg_var,
                          font=('Helvetica', 10), width=7,
                          relief='flat', bg='#eef0ff')
        spin.pack(anchor='w', padx=8, pady=(2, 8))
        Tooltip(spin, 'Exclut les employés dont la moyenne\n'
                      '(semaines non-nulles) est inférieure.')

        self._btn(parent, '▶  Analyser', self._analyze,
                  TEAL, padx=8, pady=10).pack(fill='x', padx=10, pady=(0, 6))
        self._btn(parent, '💾  Exporter HTML', self._export_html,
                  PURPLE, padx=8, pady=7).pack(fill='x', padx=10, pady=(0, 14))

    def _build_right_panel(self, parent):
        self.notebook = ttk.Notebook(parent)
        self.notebook.pack(fill='both', expand=True)
        self.chart_frame  = tk.Frame(self.notebook, bg=WHITE)
        self.table_frame  = tk.Frame(self.notebook, bg=WHITE)
        self.detail_frame = tk.Frame(self.notebook, bg=WHITE)
        self.notebook.add(self.chart_frame,  text='📈  Graphique')
        self.notebook.add(self.table_frame,  text='📊  Tableau récapitulatif')
        self.notebook.add(self.detail_frame, text='📋  Détail hebdomadaire')
        self._show_placeholder()

    # ── Gestion des fichiers ─────────────────────────────────────────────────

    def _add_files(self):
        files = filedialog.askopenfilenames(
            title='Sélectionner les rapports hebdomadaires',
            filetypes=[('Fichiers Excel', '*.xlsx *.xls'), ('Tous', '*.*')])
        added = 0
        for f in files:
            if f not in self.files:
                self.files.append(f)
                self.file_listbox.insert('end', os.path.basename(f))
                added += 1
        if added:
            self.status_var.set(f'{len(self.files)} fichier(s) — {added} ajouté(s).')

    def _clear_files(self):
        self.files.clear()
        self.file_listbox.delete(0, 'end')
        self.status_var.set('Liste effacée.')
        self._show_placeholder()

    # ── Analyse ──────────────────────────────────────────────────────────────

    def _analyze(self):
        if not self.files:
            messagebox.showwarning('Aucun fichier',
                'Veuillez sélectionner au moins un fichier XLSX.')
            return
        self.status_var.set('⏳  Analyse en cours…')
        self.update_idletasks()
        try:
            min_avg = float(self.min_avg_var.get())
            weeks, emp_data, errors = process_files(self.files, min_avg)
        except Exception as e:
            messagebox.showerror('Erreur', str(e))
            self.status_var.set(f'Erreur : {e}')
            return
        self.weeks         = weeks
        self.employee_data = emp_data
        self._build_chart()
        self._build_summary_table()
        self._build_detail_table()
        msg = (f'✓  {len(weeks)} semaine(s) ISO · {len(emp_data)} employé(s) '
               f'avec ≥ {min_avg:.1f} h/sem (moy.)')
        if errors:
            msg += f' · ⚠ {len(errors)} fichier(s) ignoré(s)'
            messagebox.showwarning('Fichiers ignorés',
                '\n'.join(errors))
        self.status_var.set(msg)

    # ── Graphique ────────────────────────────────────────────────────────────

    def _build_chart(self):
        for w in self.chart_frame.winfo_children():
            w.destroy()
        sorted_emps = self._sorted_employees()
        fig, ax = plt.subplots(figsize=(11, 5.2))
        fig.patch.set_facecolor(WHITE)
        ax.set_facecolor('#fafbff')
        lines = {}
        for i, (code, stats) in enumerate(sorted_emps):
            color = COLORS[i % len(COLORS)]
            ln, = ax.plot(self.weeks, stats['hours_per_week'],
                          marker='o', markersize=5, linewidth=2,
                          color=color, label=stats['name'])
            lines[code] = ln
        ax.set_title('Heures travaillées par semaine et par employé',
                     fontsize=14, fontweight='bold', pad=14, color=DARK)
        ax.set_xlabel('Semaine (lundi de la semaine ISO)', fontsize=10, color='#444')
        ax.set_ylabel('Heures', fontsize=10, color='#444')
        ax.grid(True, linestyle='--', linewidth=0.6, alpha=0.5, color='#c0c8e8')
        for spine in ax.spines.values():
            spine.set_color('#dde3ff')
        legend = ax.legend(loc='upper left', bbox_to_anchor=(1.01, 1),
                           fontsize=8.5, framealpha=0.95,
                           title='Employé (cliquer pour masquer)',
                           title_fontsize=8)
        lined = {ll: lines[code]
                 for (code, _), ll in zip(sorted_emps, legend.get_lines())}
        def on_pick(event):
            ll = event.artist
            if ll not in lined: return
            dl = lined[ll]
            vis = not dl.get_visible()
            dl.set_visible(vis)
            ll.set_alpha(1.0 if vis else 0.3)
            fig.canvas.draw()
        for ll in legend.get_lines():
            ll.set_picker(True); ll.set_pickradius(8)
        fig.canvas.mpl_connect('pick_event', on_pick)
        plt.xticks(rotation=45, ha='right', fontsize=8)
        n      = len(self.weeks)
        window = min(5, n)
        # Initial view: last 5 weeks.  Full range preserved for toolbar save/export.
        ax.set_xlim(max(-0.5, n - window - 0.5), n - 0.5)
        plt.tight_layout()
        canvas = FigureCanvasTkAgg(fig, master=self.chart_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill='both', expand=True, padx=8, pady=6)
        toolbar_frame = tk.Frame(self.chart_frame, bg=WHITE)
        toolbar_frame.pack(fill='x')
        from matplotlib.backends.backend_tkagg import NavigationToolbar2Tk
        NavigationToolbar2Tk(canvas, toolbar_frame)
        # ── Scrollbar horizontal ──────────────────────────────────────────────
        scroll_frame = tk.Frame(self.chart_frame, bg=WHITE)
        scroll_frame.pack(fill='x', padx=8, pady=(0, 2))
        tk.Label(scroll_frame, text='◀  Historique  ▶',
                 bg=WHITE, fg='#999', font=('Helvetica', 7)
                 ).pack(side='left', padx=4)
        def _on_hscroll(val):
            v = float(val)
            ax.set_xlim(v - 0.5, v + window - 0.5)
            canvas.draw_idle()
        hscroll = ttk.Scale(scroll_frame, from_=0, to=max(0, n - window),
                            orient='horizontal', command=_on_hscroll)
        hscroll.set(max(0, n - window))   # start at the most recent weeks
        hscroll.pack(side='left', fill='x', expand=True, padx=4)
        tk.Label(self.chart_frame,
                 text='💡  Glissez la barre pour naviguer · cliquez un nom pour masquer/afficher.',
                 bg=WHITE, fg='#888', font=('Helvetica', 8, 'italic')
                 ).pack(pady=2)

    # ── Tableau récapitulatif ─────────────────────────────────────────────────

    def _build_summary_table(self):
        for w in self.table_frame.winfo_children():
            w.destroy()
        tk.Label(self.table_frame,
                 text='Statistiques par employé  —  moyenne sur semaines actives uniquement',
                 font=('Helvetica', 10, 'italic'), bg=WHITE, fg='#555'
                 ).pack(pady=(10, 4))
        cols = ('Employé', 'Code', 'Total (h)', 'Moy./sem (h)',
                'Semaines actives', '/ Total semaines')
        tree = ttk.Treeview(self.table_frame, columns=cols,
                            show='headings', height=18)
        widths = [200, 80, 100, 120, 140, 130]
        aligns = ['w','center','center','center','center','center']
        for col, w, a in zip(cols, widths, aligns):
            tree.heading(col, text=col,
                         command=lambda c=col: self._sort_tree(tree, c))
            tree.column(col, anchor=a, width=w)
        sorted_emps = self._sorted_employees()
        for i, (code, stats) in enumerate(sorted_emps):
            tag = f'row_{i}'
            tree.insert('', 'end', tags=(tag,), values=(
                stats['name'], code,
                f"{stats['total']:.2f}",
                f"{stats['avg']:.2f}",
                stats['active_weeks'],
                len(self.weeks)))
            tree.tag_configure(tag,
                background='#f0f3ff' if i % 2 == 0 else WHITE)
        grand = sum(s['total'] for _, s in sorted_emps)
        tree.insert('', 'end', tags=('tot',), values=(
            'TOTAL', '', f'{grand:.2f}', '', '', ''))
        tree.tag_configure('tot', background=DARK, foreground=WHITE,
                           font=('Helvetica', 9, 'bold'))
        vsb = ttk.Scrollbar(self.table_frame, orient='vertical', command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        vsb.pack(side='right', fill='y', padx=(0, 8))
        tree.pack(fill='both', expand=True, padx=(12, 0), pady=(0, 10))

    # ── Tableau de détail ─────────────────────────────────────────────────────

    def _build_detail_table(self):
        for w in self.detail_frame.winfo_children():
            w.destroy()
        tk.Label(self.detail_frame,
                 text='Heures par semaine ISO et par employé  —  « – » = semaine inactive',
                 font=('Helvetica', 10, 'italic'), bg=WHITE, fg='#555'
                 ).pack(pady=(10, 4))
        sorted_emps = self._sorted_employees()
        short = [s['name'].split(',')[0].strip() for _, s in sorted_emps]
        cols  = ('Semaine',) + tuple(short) + ('Total sem.',)
        tree  = ttk.Treeview(self.detail_frame, columns=cols, show='headings')
        tree.column('Semaine',    anchor='center', width=85)
        tree.column('Total sem.', anchor='center', width=90)
        for n in short:
            tree.column(n, anchor='center', width=max(75, len(n)*8))
        for col in cols:
            tree.heading(col, text=col)
        for i, week in enumerate(self.weeks):
            wt  = sum(s['hours_per_week'][i] for _, s in sorted_emps)
            h_cells = [
                f'{s["hours_per_week"][i]:.2f}' if s['hours_per_week'][i] > 0 else '–'
                for _, s in sorted_emps
            ]
            tree.insert('', 'end',
                        values=[week] + h_cells + [f'{wt:.2f}'],
                        tags=('even' if i % 2 == 0 else 'odd',))
        grand = sum(s['total'] for _, s in sorted_emps)
        tree.insert('', 'end',
                    values=['TOTAL'] + [f'{s["total"]:.2f}' for _, s in sorted_emps]
                           + [f'{grand:.2f}'],
                    tags=('tot',))
        tree.tag_configure('even', background='#f0f3ff')
        tree.tag_configure('odd',  background=WHITE)
        tree.tag_configure('tot',  background=DARK, foreground=WHITE,
                           font=('Helvetica', 9, 'bold'))
        vsb = ttk.Scrollbar(self.detail_frame, orient='vertical',  command=tree.yview)
        hsb = ttk.Scrollbar(self.detail_frame, orient='horizontal', command=tree.xview)
        tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        vsb.pack(side='right',  fill='y',  padx=(0, 8))
        hsb.pack(side='bottom', fill='x',  pady=(0, 8))
        tree.pack(fill='both', expand=True, padx=(12, 0))

    # ── Export HTML ───────────────────────────────────────────────────────────

    def _export_html(self):
        if not self.employee_data:
            messagebox.showinfo('Aucune donnée',
                'Analysez d\'abord des fichiers.')
            return
        path = filedialog.asksaveasfilename(
            title='Enregistrer le rapport HTML',
            defaultextension='.html',
            filetypes=[('Fichier HTML', '*.html')])
        if not path:
            return
        sorted_emps = self._sorted_employees()
        now = datetime.now().strftime('%Y-%m-%d %H:%M')
        n_weeks = len(self.weeks)

        # Tableau récapitulatif
        summary_rows = ''
        for i, (code, s) in enumerate(sorted_emps):
            bg = '#f0f3ff' if i % 2 == 0 else '#ffffff'
            summary_rows += (
                f'<tr style="background:{bg}">'
                f'<td>{s["name"]}</td><td>{code}</td>'
                f'<td style="text-align:right">{s["total"]:.2f}</td>'
                f'<td style="text-align:right">{s["avg"]:.2f}</td>'
                f'<td style="text-align:center">{s["active_weeks"]}</td>'
                f'<td style="text-align:center">{n_weeks}</td></tr>\n')
        grand = sum(s['total'] for _, s in sorted_emps)

        # En-têtes du tableau de détail
        det_hdr = ''.join(
            f'<th>{s["name"].split(",")[0].strip()}</th>'
            for _, s in sorted_emps)

        # Lignes du tableau de détail
        det_rows = ''
        for i, week in enumerate(self.weeks):
            bg = '#f0f3ff' if i % 2 == 0 else '#ffffff'
            wt = sum(s['hours_per_week'][i] for _, s in sorted_emps)
            cells = ''.join(
                '<td style="text-align:center">'
                + ('–' if s['hours_per_week'][i] == 0
                   else f'{s["hours_per_week"][i]:.2f}')
                + '</td>'
                for _, s in sorted_emps)
            det_rows += (
                f'<tr style="background:{bg}">'
                f'<td style="text-align:center">{week}</td>'
                f'{cells}'
                f'<td style="text-align:center;font-weight:bold">{wt:.2f}</td>'
                f'</tr>\n')
        emp_tot_cells = ''.join(
            f'<td style="text-align:center">{s["total"]:.2f}</td>'
            for _, s in sorted_emps)

        # Données Chart.js
        labels_js = str(self.weeks)
        datasets_js = ','.join(
            f'{{"label":"{s["name"]}",'
            f'"data":{s["hours_per_week"]},'
            f'"borderColor":"{COLORS[i % len(COLORS)]}",'
            f'"backgroundColor":"{COLORS[i % len(COLORS)]}33",'
            f'"tension":0.3,"pointRadius":4}}'
            for i, (_, s) in enumerate(sorted_emps))

        html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport d'heures — Architecture EVOQ</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
:root{{--dark:#1a1a2e;--accent:#4361ee;--bg:#f5f7ff}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);color:#222}}
header{{background:var(--dark);color:#fff;padding:18px 28px;
        display:flex;justify-content:space-between;align-items:center}}
header h1{{font-size:1.4rem}}
header small{{color:#aac;font-size:.82rem}}
main{{max-width:1300px;margin:24px auto;padding:0 16px}}
section{{background:#fff;border-radius:10px;box-shadow:0 2px 12px #0001;
         padding:24px;margin-bottom:24px}}
h2{{font-size:1.05rem;color:var(--dark);margin-bottom:16px;
    border-left:4px solid var(--accent);padding-left:10px}}
table{{width:100%;border-collapse:collapse;font-size:.88rem}}
th{{background:#dde3ff;color:var(--dark);padding:8px 12px;text-align:left}}
td{{padding:7px 12px;border-bottom:1px solid #eef}}
tr.tot{{background:var(--dark)!important;color:#fff;font-weight:bold}}
.chart-wrap{{position:relative;height:420px}}
footer{{text-align:center;font-size:.78rem;color:#aaa;padding:16px 0 24px}}
</style>
</head>
<body>
<header>
  <h1>⏱ Rapport d'heures — Architecture EVOQ</h1>
  <small>🔒 Généré localement le {now} · Données confidentielles</small>
</header>
<main>
<section>
  <h2>Heures travaillées par semaine ISO et par employé</h2>
  <p style="font-size:.82rem;color:#888;margin-bottom:12px">
    Chaque colonne correspond à une semaine ISO (lundi au dimanche).
    Les rapports couvrant plusieurs semaines sont correctement ventilés.
  </p>
  <div class="chart-wrap"><canvas id="hoursChart"></canvas></div>
</section>
<section>
  <h2>Tableau récapitulatif par employé</h2>
  <table><thead><tr>
    <th>Employé</th><th>Code</th>
    <th style="text-align:right">Total (h)</th>
    <th style="text-align:right">Moy./sem (h)</th>
    <th style="text-align:center">Semaines actives</th>
    <th style="text-align:center">/ Total sem.</th>
  </tr></thead><tbody>
  {summary_rows}
  <tr class="tot"><td colspan="2">TOTAL</td>
    <td style="text-align:right">{grand:.2f}</td>
    <td colspan="3"></td></tr>
  </tbody></table>
</section>
<section>
  <h2>Détail hebdomadaire</h2>
  <div style="overflow-x:auto"><table><thead><tr>
    <th>Semaine</th>{det_hdr}<th>Total sem.</th>
  </tr></thead><tbody>
  {det_rows}
  <tr class="tot"><td>TOTAL</td>{emp_tot_cells}
    <td style="text-align:center">{grand:.2f}</td></tr>
  </tbody></table></div>
</section>
</main>
<footer>Rapport généré par l'Analyseur de Rapports d'Heures — données traitées localement</footer>
<script>
new Chart(document.getElementById('hoursChart'),{{
  type:'line',
  data:{{labels:{labels_js},datasets:[{datasets_js}]}},
  options:{{
    responsive:true,maintainAspectRatio:false,
    interaction:{{mode:'index',intersect:false}},
    plugins:{{
      legend:{{position:'right'}},
      tooltip:{{callbacks:{{label:(c)=>c.dataset.label+': '+c.parsed.y.toFixed(2)+'h'}}}}
    }},
    scales:{{
      x:{{ticks:{{maxRotation:45,font:{{size:10}}}}}},
      y:{{title:{{display:true,text:'Heures'}},beginAtZero:true}}
    }}
  }}
}});
</script>
</body></html>"""

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        self.status_var.set(f'✓  Rapport HTML exporté : {os.path.basename(path)}')
        if messagebox.askyesno('Export réussi',
                f'Sauvegardé :\n{path}\n\nOuvrir dans le navigateur ?'):
            import webbrowser
            webbrowser.open(f'file://{os.path.abspath(path)}')

    # ── Utilitaires ───────────────────────────────────────────────────────────

    def _sorted_employees(self):
        return sorted(self.employee_data.items(),
                      key=lambda x: x[1]['total'], reverse=True)

    def _sort_tree(self, tree, col):
        data = [(tree.set(k, col), k) for k in tree.get_children('')]
        try:
            data.sort(key=lambda t: float(t[0].replace('–','0')))
        except ValueError:
            data.sort()
        for i, (_, k) in enumerate(data):
            tree.move(k, '', i)

    def _show_placeholder(self):
        for frame in (self.chart_frame, self.table_frame, self.detail_frame):
            for w in frame.winfo_children():
                w.destroy()
        tk.Label(self.chart_frame,
                 text=('Aucune donnée à afficher.\n\n'
                       '1. Ajoutez des fichiers XLSX.\n'
                       '2. Ajustez la moyenne minimale si nécessaire.\n'
                       '3. Cliquez sur ▶ Analyser.'),
                 justify='center', font=('Helvetica', 12),
                 fg='#aaa', bg=WHITE).pack(expand=True)


# ═══════════════════════════════════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    missing = []
    for mod in ['pandas', 'openpyxl', 'matplotlib']:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        print(f"Modules manquants : {', '.join(missing)}\n"
              f"Installez-les : pip install {' '.join(missing)}")
        sys.exit(1)
    HoursAnalyzerApp().mainloop()
