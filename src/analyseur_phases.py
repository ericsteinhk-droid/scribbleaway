#!/usr/bin/env python3
"""
Analyseur d'Heures par Phase — Architecture EVOQ
Variante du programme principal : génère un onglet par employé avec
graphique en aires empilées par phase, lignes de plafond et de cibles.

Dépendances : pandas, openpyxl, matplotlib
"""

import os, re, sys, tkinter as tk
from tkinter import ttk, filedialog, messagebox
from datetime import datetime
from collections import defaultdict

import pandas as pd
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.lines import Line2D

# ─── Couleurs UI ──────────────────────────────────────────────────────────────
DARK   = '#1a1a2e'
ACCENT = '#4361ee'
TEAL   = '#2ec4b6'
DANGER = '#ef233c'
LIGHT  = '#f5f7ff'
WHITE  = '#ffffff'
MUTED  = '#aaaacc'
PURPLE = '#6366f1'

# ─── Palette des phases (correspondance numéro → couleur + label court) ───────
PHASE_PALETTE = {
    '00.00': ('#bdc3c7', 'Honoraires prof.'),
    '44.00': ('#2c5f8a', 'Construction'),
    '45.00': ('#3a9e8a', 'Prép. DDC/ODC'),
    '46.00': ('#e67e22', 'Surv. chantier supp.'),
    '47.00': ('#8e44ad', 'Surv. chantier'),
    '48.00': ('#5b8dd9', 'Réunion Decasult'),
    '49.00': ('#7ec8c8', 'Tableau QRT'),
    '53.00': ('#9b59b6', 'Commentaire échéancier'),
    '54.00': ('#95a5a6', 'Autres'),
    '56.00': ('#e74c3c', 'MAJ plans AO'),
}
FALLBACK_COLORS = [
    '#f39c12','#1abc9c','#d35400','#2980b9','#8e44ad',
    '#16a085','#c0392b','#27ae60','#2c3e50','#f1c40f',
]


def phase_color(pnum: str, index: int = 0) -> str:
    return PHASE_PALETTE.get(pnum, (FALLBACK_COLORS[index % len(FALLBACK_COLORS)], ''))[0]

def phase_label(pnum: str, desc: str) -> str:
    short = PHASE_PALETTE.get(pnum, ('', ''))[1] or desc[:25]
    return f'{pnum} — {short}'


# ═══════════════════════════════════════════════════════════════════════════════
#  PARSING
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_date(s: str):
    try:
        if len(s) == 10 and s[4] == '-':
            return datetime.strptime(s, '%Y-%m-%d')
        return datetime.strptime(s, '%m/%d/%Y')
    except ValueError:
        return None


def parse_file(filepath: str) -> dict:
    """
    Lit un rapport XLSX et retourne :
      {week_key: {emp_code: {phase_num: hours, '_name': str}}}

    Chaque entrée est attribuée à sa semaine ISO et à la phase courante.
    """
    try:
        df = pd.read_excel(filepath, sheet_name=0, header=None)
    except Exception as e:
        raise RuntimeError(f"Impossible de lire {os.path.basename(filepath)}: {e}")

    phase_hdr = re.compile(r'Phase Number:\s*(\d+\.\d+)\s*(.*)')
    entry_pat  = re.compile(
        r'^[A-Z0-9]{3}-\d{3}\s+(?:B\s+)?(E[A-Z]{3,6})\s+'
        r'([\w\-][\w\-\s]*,\s*[\w\-\s]+?)\s{4,}'
        r'(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})'
    )

    result       = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    emp_names    = {}
    phase_descs  = {}
    current_phase = None

    for _, row in df.iterrows():
        cell = str(row[0]).strip() if pd.notna(row[0]) else ''

        m = phase_hdr.search(cell)
        if m:
            current_phase = m.group(1).strip()
            desc = m.group(2).strip()
            if current_phase not in phase_descs:
                phase_descs[current_phase] = desc
            continue

        m = entry_pat.match(cell)
        if not m or current_phase is None:
            continue

        code, name, ds = m.group(1), m.group(2).strip(), m.group(3)
        try:
            h = float(row[3]) if pd.notna(row[3]) else 0.0
        except (ValueError, TypeError):
            h = 0.0

        dt = _parse_date(ds)
        if not dt:
            continue

        iso      = dt.isocalendar()
        week_key = f'{iso[0]}-W{iso[1]:02d}'

        emp_names[code] = name
        result[week_key][code][current_phase] += h

    return dict(result), emp_names, phase_descs


def process_files(filepaths: list, min_avg: float = 3.0) -> tuple:
    """
    Agrège tous les fichiers.

    Retourne :
      sorted_weeks    : liste de week_key triés
      week_labels     : labels JJ-MM-AA
      employees       : {code: name}
      phase_descs     : {pnum: description}
      data            : {code: {week_key: {pnum: hours}}}
      stats           : {code: {total, avg, active_weeks}}
      errors          : liste d'erreurs
    """
    merged  = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    emp_names   = {}
    phase_descs = {}
    errors      = []

    for fp in filepaths:
        try:
            week_data, names, descs = parse_file(fp)
        except RuntimeError as e:
            errors.append(str(e))
            continue
        emp_names.update(names)
        phase_descs.update(descs)
        for wk, emps in week_data.items():
            for code, phases in emps.items():
                for pnum, h in phases.items():
                    merged[wk][code][pnum] += h

    sorted_weeks = sorted(merged.keys())
    week_labels  = []
    for wk in sorted_weeks:
        yr, wn = int(wk[:4]), int(wk[6:])
        monday = datetime.fromisocalendar(yr, wn, 1)
        week_labels.append(monday.strftime('%d/%m'))

    # Construire data par employé
    data  = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    stats = {}

    for wk in sorted_weeks:
        for code, phases in merged[wk].items():
            for pnum, h in phases.items():
                data[code][wk][pnum] += h

    for code in emp_names:
        hours_pw = [sum(data[code][wk].values()) for wk in sorted_weeks]
        total    = sum(hours_pw)
        non_zero = [h for h in hours_pw if h > 0]
        avg      = sum(non_zero) / len(non_zero) if non_zero else 0.0
        stats[code] = {
            'total': total,
            'avg': avg,
            'active_weeks': len(non_zero),
        }

    # Filtre par moyenne minimale
    filtered_codes = {c for c, s in stats.items() if s['avg'] >= min_avg}
    employees  = {c: n for c, n in emp_names.items() if c in filtered_codes}
    data       = {c: v for c, v in data.items() if c in filtered_codes}
    stats      = {c: v for c, v in stats.items() if c in filtered_codes}

    return sorted_weeks, week_labels, employees, phase_descs, dict(data), stats, errors


# ═══════════════════════════════════════════════════════════════════════════════
#  INTERFACE GRAPHIQUE
# ═══════════════════════════════════════════════════════════════════════════════

class PhaseAnalyzerApp(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Analyseur par Phase — Architecture EVOQ")
        self.geometry('1350x860')
        self.minsize(1000, 650)
        self.configure(bg=LIGHT)

        self.files        = []
        self.sorted_weeks = []
        self.week_labels  = []
        self.employees    = {}
        self.phase_descs  = {}
        self.data         = {}
        self.stats        = {}
        self.min_avg_var  = tk.DoubleVar(value=3.0)

        # Paramètres par employé : plafond + cibles de phase
        # {code: {'ceiling': DoubleVar, 'targets': {pnum: DoubleVar}}}
        self.emp_settings = {}

        self._apply_styles()
        self._build_ui()

    # ── Styles ───────────────────────────────────────────────────────────────

    def _apply_styles(self):
        s = ttk.Style(self)
        s.theme_use('clam')
        s.configure('TNotebook',        background=LIGHT,     borderwidth=0)
        s.configure('TNotebook.Tab',    background='#dde3ff', foreground='#333',
                    padding=[10, 5],    font=('Helvetica', 9, 'bold'))
        s.map('TNotebook.Tab',          background=[('selected', WHITE)])
        s.configure('Treeview',         background=WHITE, fieldbackground=WHITE,
                    rowheight=22,       font=('Helvetica', 9))
        s.configure('Treeview.Heading', background='#dde3ff', foreground=DARK,
                    font=('Helvetica', 9, 'bold'))

    # ── UI principale ─────────────────────────────────────────────────────────

    def _build_ui(self):
        # En-tête
        header = tk.Frame(self, bg=DARK, height=58)
        header.pack(fill='x')
        header.pack_propagate(False)
        tk.Label(header, text='📊  Analyseur d\'Heures par Phase',
                 font=('Helvetica', 16, 'bold'), bg=DARK, fg=WHITE
                 ).pack(side='left', padx=20, pady=12)
        tk.Label(header, text='🔒  Traitement 100 % local',
                 font=('Helvetica', 9), bg=DARK, fg=MUTED
                 ).pack(side='right', padx=20)

        body = tk.Frame(self, bg=LIGHT)
        body.pack(fill='both', expand=True, padx=10, pady=8)

        # Panneau gauche (controls)
        self.left = tk.Frame(body, bg=WHITE, width=265, relief='groove', bd=1)
        self.left.pack(side='left', fill='y', padx=(0, 10))
        self.left.pack_propagate(False)
        self._build_left_panel()

        # Panneau droit (onglets par employé)
        self.right = tk.Frame(body, bg=LIGHT)
        self.right.pack(side='left', fill='both', expand=True)
        self._build_placeholder()

        # Barre de statut
        self.status_var = tk.StringVar(value='Sélectionnez des fichiers XLSX et cliquez sur Analyser.')
        tk.Label(self, textvariable=self.status_var, bg=DARK, fg=MUTED,
                 font=('Helvetica', 9), anchor='w', padx=10
                 ).pack(fill='x', side='bottom')

    def _btn(self, parent, text, cmd, bg, **kw):
        return tk.Button(parent, text=text, command=cmd, bg=bg, fg=WHITE,
                         font=('Helvetica', 10, 'bold'), relief='flat',
                         cursor='hand2', activebackground=bg,
                         activeforeground=WHITE, **kw)

    # ── Panneau gauche ────────────────────────────────────────────────────────

    def _build_left_panel(self):
        p = self.left
        tk.Label(p, text='Fichiers rapports XLSX', bg=WHITE,
                 font=('Helvetica', 10, 'bold'), fg=DARK
                 ).pack(pady=(12, 5), padx=10, anchor='w')

        bf = tk.Frame(p, bg=WHITE)
        bf.pack(fill='x', padx=8)
        self._btn(bf, '➕  Ajouter fichiers', self._add_files,
                  ACCENT, padx=6, pady=5).pack(fill='x', pady=2)
        self._btn(bf, '🗑  Effacer la liste', self._clear_files,
                  DANGER, padx=6, pady=4).pack(fill='x', pady=2)

        lf = tk.Frame(p, bg=WHITE)
        lf.pack(fill='both', expand=True, padx=8, pady=4)
        sb = ttk.Scrollbar(lf)
        sb.pack(side='right', fill='y')
        self.file_listbox = tk.Listbox(lf, font=('Courier', 7), bg='#f0f2ff',
                                       relief='flat', bd=0,
                                       selectbackground=ACCENT,
                                       yscrollcommand=sb.set)
        self.file_listbox.pack(fill='both', expand=True)
        sb.config(command=self.file_listbox.yview)

        # Paramètres globaux
        pm = tk.LabelFrame(p, text=' Paramètres globaux ', bg=WHITE,
                           fg='#555', font=('Helvetica', 8))
        pm.pack(fill='x', padx=8, pady=6)
        tk.Label(pm, text='Moyenne min. incluse (h/sem) :',
                 bg=WHITE, font=('Helvetica', 8)).pack(anchor='w', padx=6, pady=(4,0))
        tk.Spinbox(pm, from_=0, to=40, increment=0.5,
                   textvariable=self.min_avg_var,
                   font=('Helvetica', 9), width=7, relief='flat', bg='#eef0ff'
                   ).pack(anchor='w', padx=6, pady=(2, 6))

        self._btn(p, '▶  Analyser', self._analyze,
                  TEAL, padx=6, pady=8).pack(fill='x', padx=8, pady=(2, 4))

        # Zone de paramètres par employé (remplie après analyse)
        tk.Label(p, text='Plafonds & Cibles par employé :',
                 bg=WHITE, font=('Helvetica', 8, 'bold'), fg='#444'
                 ).pack(anchor='w', padx=10, pady=(4, 2))

        self.settings_canvas = tk.Canvas(p, bg=WHITE, highlightthickness=0)
        self.settings_scroll  = ttk.Scrollbar(p, orient='vertical',
                                               command=self.settings_canvas.yview)
        self.settings_canvas.configure(yscrollcommand=self.settings_scroll.set)
        self.settings_scroll.pack(side='right', fill='y')
        self.settings_canvas.pack(fill='both', expand=True, padx=4)
        self.settings_inner = tk.Frame(self.settings_canvas, bg=WHITE)
        self.settings_canvas.create_window((0, 0), window=self.settings_inner, anchor='nw')
        self.settings_inner.bind('<Configure>',
            lambda e: self.settings_canvas.configure(
                scrollregion=self.settings_canvas.bbox('all')))

        self._btn(p, '🔄  Mettre à jour graphiques', self._refresh_charts,
                  PURPLE, padx=6, pady=6).pack(fill='x', padx=8, pady=4)
        self._btn(p, '💾  Exporter HTML', self._export_html,
                  '#0f766e', padx=6, pady=5).pack(fill='x', padx=8, pady=(0, 10))

    def _build_settings_for_employees(self):
        """Construit les champs plafond + cibles pour chaque employé."""
        for w in self.settings_inner.winfo_children():
            w.destroy()
        self.emp_settings = {}

        all_phases = set()
        for code in self.employees:
            for wk in self.sorted_weeks:
                all_phases.update(self.data.get(code, {}).get(wk, {}).keys())

        for code, name in sorted(self.employees.items(),
                                  key=lambda x: self.stats[x[0]]['total'],
                                  reverse=True):
            short = name.split(',')[0].strip()
            frm = tk.LabelFrame(self.settings_inner, text=f' {short} ',
                                 bg=WHITE, fg=DARK, font=('Helvetica', 8, 'bold'),
                                 relief='groove', bd=1)
            frm.pack(fill='x', padx=4, pady=3)

            ceiling_var = tk.DoubleVar(value=0.0)
            tk.Label(frm, text='Plafond (h/sem) :', bg=WHITE,
                     font=('Helvetica', 8)).grid(row=0, column=0, sticky='w', padx=4, pady=2)
            tk.Spinbox(frm, from_=0, to=80, increment=1,
                       textvariable=ceiling_var, width=6,
                       font=('Helvetica', 8), relief='flat', bg='#eef0ff'
                       ).grid(row=0, column=1, padx=4, pady=2)

            emp_phases = set()
            for wk in self.sorted_weeks:
                emp_phases.update(self.data.get(code, {}).get(wk, {}).keys())

            target_vars = {}
            for r, pnum in enumerate(sorted(emp_phases), start=1):
                color = PHASE_PALETTE.get(pnum, (FALLBACK_COLORS[r % len(FALLBACK_COLORS)], ''))[0]
                lbl   = PHASE_PALETTE.get(pnum, ('', pnum))[1] or pnum
                tk.Label(frm, text=f'  ↳ {pnum} cible:', bg=WHITE,
                         font=('Helvetica', 7), fg='#555'
                         ).grid(row=r, column=0, sticky='w', padx=4)
                tv = tk.DoubleVar(value=0.0)
                tk.Spinbox(frm, from_=0, to=40, increment=0.5,
                           textvariable=tv, width=6,
                           font=('Helvetica', 7), relief='flat', bg='#eef0ff'
                           ).grid(row=r, column=1, padx=4)
                target_vars[pnum] = tv

            self.emp_settings[code] = {
                'ceiling': ceiling_var,
                'targets': target_vars,
            }

    # ── Gestion fichiers ──────────────────────────────────────────────────────

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
        self._build_placeholder()
        self.status_var.set('Liste effacée.')

    # ── Analyse ──────────────────────────────────────────────────────────────

    def _analyze(self):
        if not self.files:
            messagebox.showwarning('Aucun fichier',
                'Sélectionnez au moins un fichier XLSX.')
            return
        self.status_var.set('⏳  Analyse en cours…')
        self.update_idletasks()
        try:
            min_avg = float(self.min_avg_var.get())
            (self.sorted_weeks, self.week_labels,
             self.employees, self.phase_descs,
             self.data, self.stats, errors) = process_files(self.files, min_avg)
        except Exception as e:
            messagebox.showerror('Erreur', str(e))
            self.status_var.set(f'Erreur : {e}')
            return

        self._build_settings_for_employees()
        self._build_employee_notebook()

        n = len(self.employees)
        w = len(self.sorted_weeks)
        msg = f'✓  {w} semaine(s) ISO · {n} employé(s)'
        if errors:
            msg += f' · ⚠ {len(errors)} fichier(s) ignoré(s)'
        self.status_var.set(msg)

    def _refresh_charts(self):
        if not self.employees:
            messagebox.showinfo('Aucune donnée', 'Analysez d\'abord des fichiers.')
            return
        self._build_employee_notebook()
        self.status_var.set('✓  Graphiques mis à jour avec les nouveaux paramètres.')

    # ── Placeholder ───────────────────────────────────────────────────────────

    def _build_placeholder(self):
        for w in self.right.winfo_children():
            w.destroy()
        tk.Label(self.right,
                 text=('Aucune donnée.\n\n'
                       '1. Ajoutez des fichiers XLSX.\n'
                       '2. Cliquez sur ▶ Analyser.\n'
                       '3. Optionnel : saisissez les plafonds et cibles,\n'
                       '   puis cliquez sur 🔄 Mettre à jour.'),
                 justify='center', font=('Helvetica', 12),
                 fg='#bbb', bg=WHITE).pack(expand=True, fill='both')

    # ── Notebook par employé ──────────────────────────────────────────────────

    def _build_employee_notebook(self):
        for w in self.right.winfo_children():
            w.destroy()

        nb = ttk.Notebook(self.right)
        nb.pack(fill='both', expand=True)
        self.emp_tab_frames = {}

        for code, name in sorted(self.employees.items(),
                                   key=lambda x: self.stats[x[0]]['total'],
                                   reverse=True):
            short = name.split(',')[0].strip()
            frame = tk.Frame(nb, bg=WHITE)
            nb.add(frame, text=f'  {short}  ')
            self._build_employee_chart(frame, code, name)

    # ── Graphique empilé par phase ────────────────────────────────────────────

    def _build_employee_chart(self, parent, code: str, name: str):
        for w in parent.winfo_children():
            w.destroy()

        s     = self.stats[code]
        cfg   = self.emp_settings.get(code, {})
        ceil  = cfg.get('ceiling', tk.DoubleVar(value=0)).get()
        tgts  = {p: v.get() for p, v in cfg.get('targets', {}).items()}

        # ── Collecte des phases présentes pour cet employé ──
        emp_phases = set()
        for wk in self.sorted_weeks:
            emp_phases.update(self.data.get(code, {}).get(wk, {}).keys())
        emp_phases = sorted(emp_phases)

        # ── Matrice [phase][week] ──
        phase_data = {
            pnum: [self.data.get(code, {}).get(wk, {}).get(pnum, 0.0)
                   for wk in self.sorted_weeks]
            for pnum in emp_phases
        }
        totals = [sum(phase_data[p][i] for p in emp_phases)
                  for i in range(len(self.sorted_weeks))]

        # ── En-tête stats ──
        hdr = tk.Frame(parent, bg='#f0f3ff', relief='flat')
        hdr.pack(fill='x', padx=10, pady=(8, 0))

        ceil_str = f'  ·  Plafond : {ceil:.0f} h/sem' if ceil > 0 else ''
        tk.Label(hdr,
                 text=f'{name}   —   Total : {s["total"]:.2f} h  ·  '
                      f'Semaines actives : {s["active_weeks"]}/{len(self.sorted_weeks)}  ·  '
                      f'Moyenne : {s["avg"]:.2f} h/sem{ceil_str}',
                 font=('Helvetica', 10, 'bold'), bg='#f0f3ff', fg=DARK,
                 anchor='w', padx=12, pady=6).pack(fill='x')

        # ── Figure matplotlib ──
        fig, ax = plt.subplots(figsize=(12, 4.8))
        fig.patch.set_facecolor(WHITE)
        ax.set_facecolor('#fafbff')

        xs = list(range(len(self.sorted_weeks)))

        if emp_phases:
            stacks = [phase_data[p] for p in emp_phases]
            colors = []
            for i, pnum in enumerate(emp_phases):
                colors.append(PHASE_PALETTE.get(pnum,
                    (FALLBACK_COLORS[i % len(FALLBACK_COLORS)], ''))[0])

            poly = ax.stackplot(xs, stacks, labels=[
                phase_label(p, self.phase_descs.get(p, ''))
                for p in emp_phases], colors=colors, alpha=0.88)

        # Ligne de plafond hebdomadaire
        legend_extra = []
        if ceil > 0:
            ax.axhline(y=ceil, color='#c0392b', linewidth=1.8,
                       linestyle='-', zorder=5)
            legend_extra.append(Line2D([0], [0], color='#c0392b',
                linewidth=1.8, label=f'Plafond total ({ceil:.0f} h)'))

        # Lignes de cibles par phase
        for pnum, tgt in tgts.items():
            if tgt > 0:
                col = PHASE_PALETTE.get(pnum,
                    (FALLBACK_COLORS[0], ''))[0]
                ax.axhline(y=tgt, color=col, linewidth=1.2,
                           linestyle='--', zorder=4)
                lbl = PHASE_PALETTE.get(pnum, ('', pnum))[1] or pnum
                legend_extra.append(Line2D([0], [0], color=col,
                    linewidth=1.2, linestyle='--',
                    label=f'Cible {pnum} ({tgt:.0f} h)'))

        # Annotations des totaux sur chaque semaine
        for i, total in enumerate(totals):
            if total > 0:
                ax.annotate(f'{total:.1f}',
                            xy=(i, total),
                            xytext=(0, 5),
                            textcoords='offset points',
                            ha='center', va='bottom',
                            fontsize=7.5, color='#333',
                            fontweight='bold')
            elif i > 0 and totals[i-1] > 0 and (i == len(totals)-1 or totals[i+1] > 0 if i < len(totals)-1 else True):
                # Semaine absente encadrée par des semaines actives
                ax.annotate('absent',
                            xy=(i, 0.5),
                            ha='center', va='bottom',
                            fontsize=7, color='#e74c3c',
                            fontstyle='italic')

        # Axe X
        ax.set_xticks(xs)
        ax.set_xticklabels(self.week_labels, rotation=45, ha='right', fontsize=8)
        ax.set_xlim(-0.5, len(xs) - 0.5)

        # Axe Y
        max_y = max(totals) if totals else 10
        if ceil > 0:
            max_y = max(max_y, ceil)
        ax.set_ylim(0, max_y * 1.18)
        ax.set_ylabel('Heures / semaine', fontsize=9, color='#444')
        ax.set_xlabel('Semaine (lundi)', fontsize=9, color='#444')

        ax.grid(True, axis='y', linestyle='--', linewidth=0.5,
                alpha=0.5, color='#c0c8e8')
        ax.grid(False, axis='x')
        for spine in ax.spines.values():
            spine.set_color('#dde3ff')

        # Légende
        handles, labels = ax.get_legend_handles_labels()
        handles += legend_extra
        labels  += [h.get_label() for h in legend_extra]
        legend = ax.legend(handles, labels,
                           loc='upper left', bbox_to_anchor=(1.01, 1),
                           fontsize=8, framealpha=0.96,
                           title='Phases  /  Références',
                           title_fontsize=8)

        plt.tight_layout(rect=[0, 0, 0.82, 1])

        canvas = FigureCanvasTkAgg(fig, master=parent)
        canvas.draw()
        canvas.get_tk_widget().pack(fill='both', expand=True, padx=8, pady=6)

        tb_frame = tk.Frame(parent, bg=WHITE)
        tb_frame.pack(fill='x')
        NavigationToolbar2Tk(canvas, tb_frame)

        plt.close(fig)

    # ── Export HTML ───────────────────────────────────────────────────────────

    def _export_html(self):
        if not self.employees:
            messagebox.showinfo('Aucune donnée', 'Analysez d\'abord des fichiers.')
            return

        path = filedialog.asksaveasfilename(
            title='Enregistrer le rapport HTML',
            defaultextension='.html',
            filetypes=[('Fichier HTML', '*.html')])
        if not path:
            return

        import base64, io
        now = datetime.now().strftime('%Y-%m-%d %H:%M')

        employee_sections = ''
        for code, name in sorted(self.employees.items(),
                                   key=lambda x: self.stats[x[0]]['total'],
                                   reverse=True):
            s   = self.stats[code]
            cfg = self.emp_settings.get(code, {})
            ceil= cfg.get('ceiling', tk.DoubleVar(value=0)).get()
            tgts= {p: v.get() for p, v in cfg.get('targets', {}).items()}

            emp_phases = set()
            for wk in self.sorted_weeks:
                emp_phases.update(self.data.get(code, {}).get(wk, {}).keys())
            emp_phases = sorted(emp_phases)

            phase_data = {
                pnum: [self.data.get(code,{}).get(wk,{}).get(pnum,0.0)
                       for wk in self.sorted_weeks]
                for pnum in emp_phases
            }
            totals = [sum(phase_data[p][i] for p in emp_phases)
                      for i in range(len(self.sorted_weeks))]

            # Générer le graphique en PNG base64
            fig, ax = plt.subplots(figsize=(13, 4.5))
            fig.patch.set_facecolor(WHITE)
            ax.set_facecolor('#fafbff')
            xs = list(range(len(self.sorted_weeks)))
            if emp_phases:
                stacks = [phase_data[p] for p in emp_phases]
                colors = [PHASE_PALETTE.get(p,(FALLBACK_COLORS[i%len(FALLBACK_COLORS)],''))[0]
                          for i, p in enumerate(emp_phases)]
                ax.stackplot(xs, stacks,
                             labels=[phase_label(p, self.phase_descs.get(p,''))
                                     for p in emp_phases],
                             colors=colors, alpha=0.88)
            legend_extra = []
            if ceil > 0:
                ax.axhline(y=ceil, color='#c0392b', linewidth=1.8, linestyle='-', zorder=5)
                legend_extra.append(Line2D([0],[0],color='#c0392b',linewidth=1.8,
                    label=f'Plafond total ({ceil:.0f} h)'))
            for pnum, tgt in tgts.items():
                if tgt > 0:
                    col = PHASE_PALETTE.get(pnum,(FALLBACK_COLORS[0],''))[0]
                    ax.axhline(y=tgt, color=col, linewidth=1.2, linestyle='--', zorder=4)
                    legend_extra.append(Line2D([0],[0],color=col,linewidth=1.2,
                        linestyle='--',label=f'Cible {pnum} ({tgt:.0f} h)'))
            for i, total in enumerate(totals):
                if total > 0:
                    ax.annotate(f'{total:.1f}', xy=(i,total),
                                xytext=(0,5), textcoords='offset points',
                                ha='center', va='bottom',
                                fontsize=7.5, color='#333', fontweight='bold')
            ax.set_xticks(xs)
            ax.set_xticklabels(self.week_labels, rotation=45, ha='right', fontsize=8)
            ax.set_xlim(-0.5, len(xs)-0.5)
            max_y = max(totals) if totals else 10
            if ceil > 0: max_y = max(max_y, ceil)
            ax.set_ylim(0, max_y*1.18)
            ax.set_ylabel('Heures / semaine', fontsize=9)
            ax.grid(True, axis='y', linestyle='--', linewidth=0.5, alpha=0.5)
            handles, labels = ax.get_legend_handles_labels()
            handles += legend_extra; labels += [h.get_label() for h in legend_extra]
            ax.legend(handles, labels, loc='upper left',
                      bbox_to_anchor=(1.01,1), fontsize=8, framealpha=0.96)
            plt.tight_layout(rect=[0,0,0.8,1])
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=130, bbox_inches='tight',
                        facecolor=WHITE)
            plt.close(fig)
            img_b64 = base64.b64encode(buf.getvalue()).decode()

            ceil_str = f' · Plafond : {ceil:.0f} h/sem' if ceil > 0 else ''
            employee_sections += f"""
<section class="emp">
  <h2>{name}</h2>
  <p class="meta">Total : {s['total']:.2f} h &nbsp;·&nbsp;
     Semaines actives : {s['active_weeks']}/{len(self.sorted_weeks)} &nbsp;·&nbsp;
     Moyenne : {s['avg']:.2f} h/sem{ceil_str}</p>
  <img src="data:image/png;base64,{img_b64}" alt="Graphique {name}" style="width:100%;max-width:1100px">
</section>
"""

        html = f"""<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Rapport par Phase — Architecture EVOQ</title>
<style>
:root{{--dark:#1a1a2e;--accent:#4361ee;--bg:#f5f7ff}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);color:#222}}
header{{background:var(--dark);color:#fff;padding:16px 28px;
        display:flex;justify-content:space-between;align-items:center}}
header h1{{font-size:1.3rem}}
header small{{color:#aac;font-size:.8rem}}
main{{max-width:1200px;margin:20px auto;padding:0 16px}}
.emp{{background:#fff;border-radius:10px;box-shadow:0 2px 12px #0001;
      padding:20px 24px;margin-bottom:24px}}
.emp h2{{font-size:1.1rem;color:var(--dark);
         border-left:4px solid var(--accent);padding-left:10px;margin-bottom:6px}}
.meta{{font-size:.85rem;color:#666;margin-bottom:14px;padding-left:14px}}
footer{{text-align:center;font-size:.75rem;color:#aaa;padding:12px 0 20px}}
</style></head><body>
<header>
  <h1>📊 Rapport d'heures par phase — Architecture EVOQ</h1>
  <small>🔒 Généré localement le {now}</small>
</header>
<main>{employee_sections}</main>
<footer>Rapport généré par l'Analyseur par Phase — données traitées localement</footer>
</body></html>"""

        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        self.status_var.set(f'✓  Rapport HTML exporté : {os.path.basename(path)}')
        if messagebox.askyesno('Export réussi',
                f'Rapport sauvegardé :\n{path}\n\nOuvrir dans le navigateur ?'):
            import webbrowser
            webbrowser.open(f'file://{os.path.abspath(path)}')


# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    missing = []
    for mod in ['pandas', 'openpyxl', 'matplotlib']:
        try: __import__(mod)
        except ImportError: missing.append(mod)
    if missing:
        print(f"Modules manquants : pip install {' '.join(missing)}")
        sys.exit(1)
    PhaseAnalyzerApp().mainloop()
