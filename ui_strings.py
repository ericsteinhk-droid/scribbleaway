"""ui_strings.py — Bilingual UI string catalogue (EN / FR)."""
from __future__ import annotations

_S: dict[str, dict[str, str]] = {
    # Language picker
    "lang_title":    {"en": "Language / Langue",       "fr": "Langue / Language"},
    "lang_prompt":   {"en": "Select interface language / Choisissez la langue de l'interface",
                      "fr": "Choisissez la langue de l'interface"},
    "lang_continue": {"en": "Continue / Continuer",    "fr": "Continuer"},

    # Setup wizard
    "wiz_title_first":   {"en": "Setup — EVOQ Spec Translator",    "fr": "Configuration — EVOQ Spec Translator"},
    "wiz_title_settings":{"en": "Settings — EVOQ Spec Translator", "fr": "Paramètres — EVOQ Spec Translator"},
    "wiz_heading_first": {"en": "Initial Setup",                   "fr": "Configuration initiale"},
    "wiz_heading_settings":{"en":"Settings",                       "fr": "Paramètres"},
    "wiz_api_key":       {"en": "Anthropic API key:",              "fr": "Clé API Anthropic :"},
    "wiz_lex_file":      {"en": "Lexicon file (.txt):",            "fr": "Fichier lexique (.txt) :"},
    "wiz_browse":        {"en": "Browse…",                         "fr": "Parcourir…"},
    "wiz_save":          {"en": "Save & Continue",                 "fr": "Enregistrer et continuer"},
    "wiz_lex_found":     {"en": "Default lexicon: {name}",         "fr": "Lexique par défaut : {name}"},
    "wiz_lex_missing":   {"en": "No lexicon found in app folder — use Settings to add one.",
                          "fr": "Aucun lexique trouvé — ajoutez-en un dans les paramètres."},
    "wiz_manage_lex":    {"en": "Manage Lexicon…",                 "fr": "Gérer le lexique…"},
    "wiz_clear_cache":   {"en": "Clear Translation Cache…",        "fr": "Vider le cache de traduction…"},
    "wiz_lang_label":    {"en": "Interface language:",             "fr": "Langue de l'interface :"},
    "wiz_lang_note":     {"en": "Restart the app to apply the language change.",
                          "fr": "Redémarrez l'application pour appliquer le changement de langue."},
    "wiz_invalid_key":       {"en": "Invalid key",        "fr": "Clé invalide"},
    "wiz_invalid_key_msg":   {"en": "API key must start with sk-ant-…", "fr": "La clé API doit commencer par sk-ant-…"},
    "wiz_missing_lex":       {"en": "Missing lexicon",    "fr": "Lexique manquant"},
    "wiz_missing_lex_msg":   {"en": "Please select a valid lexicon .txt file.",
                               "fr": "Veuillez sélectionner un fichier lexique .txt valide."},

    # Main window — labels
    "main_files":     {"en": "Files to translate:",          "fr": "Fichiers à traduire :"},
    "main_add_files": {"en": "Add Files…",                   "fr": "Ajouter fichiers…"},
    "main_add_folder":{"en": "Add Folder…",                  "fr": "Ajouter dossier…"},
    "main_remove":    {"en": "Remove",                       "fr": "Retirer"},
    "main_direction": {"en": "Direction:",                   "fr": "Direction :"},
    "main_fren":      {"en": "French → English",             "fr": "Français → Anglais"},
    "main_enfr":      {"en": "English → French",             "fr": "Anglais → Français"},
    "main_headers":   {"en": "Headers:",                     "fr": "En-têtes :"},
    "main_hdr_full":  {"en": "Translate fully",              "fr": "Traduction complète"},
    "main_hdr_lex":   {"en": "Lexicon only — no API",        "fr": "Lexique seulement — sans API"},
    "main_hdr_skip":  {"en": "Skip — no change",             "fr": "Ignorer — aucune modification"},
    "main_out_note":  {"en": "Output: same folder as each source file",
                       "fr": "Sortie : même dossier que chaque fichier source"},
    "main_settings":  {"en": "Settings…",                    "fr": "Paramètres…"},
    "main_estimate":  {"en": "Estimate API cost…",           "fr": "Estimer le coût API…"},
    "main_translate": {"en": "Translate",                    "fr": "Traduire"},
    "main_log":       {"en": "Progress log:",                "fr": "Journal de progression :"},

    # Main window — status / runtime
    "status_ready":   {"en": "Ready.",              "fr": "Prêt."},
    "status_xlating": {"en": "Translating…",        "fr": "Traduction en cours…"},
    "status_success": {"en": "Success!",            "fr": "Succès !"},
    "status_error":   {"en": "Error — see log.",    "fr": "Erreur — voir le journal."},
    "working":        {"en": "Working…",            "fr": "En cours…"},
    "para_progress":  {"en": "{done} / {total} paragraphs",         "fr": "{done} / {total} paragraphes"},
    "file_progress":  {"en": "File {fi}/{ft}: {done}/{total} paras","fr": "Fichier {fi}/{ft} : {done}/{total} par."},
    "file_sep":       {"en": "File {i} of {n}: {name}",             "fr": "Fichier {i} de {n} : {name}"},
    "output_files":   {"en": "Output files:",       "fr": "Fichiers de sortie :"},
    "success_n":      {"en": "{n} file(s) translated successfully.", "fr": "{n} fichier(s) traduit(s) avec succès."},

    # Dialogs
    "dlg_no_file":    {"en": "Missing file",        "fr": "Fichier manquant"},
    "dlg_no_file_msg":{"en": "Please add at least one source DOCX file.",
                       "fr": "Veuillez ajouter au moins un fichier DOCX source."},
    "dlg_not_found":  {"en": "File not found",      "fr": "Fichier introuvable"},
    "dlg_bad_type":   {"en": "Unsupported file type","fr": "Type de fichier non pris en charge"},
    "dlg_bad_type_msg":{"en":"Only DOCX files can be translated:\n{name}",
                        "fr":"Seuls les fichiers DOCX peuvent être traduits :\n{name}"},
    "dlg_no_cfg":     {"en": "No config",           "fr": "Configuration manquante"},
    "dlg_no_cfg_msg": {"en": "Configuration missing. Open Settings.",
                       "fr": "Configuration manquante. Ouvrez les paramètres."},
    "dlg_cfg_err":    {"en": "Config error",        "fr": "Erreur de configuration"},
    "dlg_cfg_issues": {"en": "Config issues",       "fr": "Problèmes de configuration"},
    "dlg_cfg_fix":    {"en": "\n\nOpen Settings to fix.", "fr": "\n\nOuvrez les paramètres pour corriger."},
    "dlg_setup_incomplete":    {"en": "Setup incomplete",   "fr": "Configuration incomplète"},
    "dlg_setup_incomplete_msg":{"en": "Configuration was not saved. Please restart and complete setup.",
                                "fr": "La configuration n'a pas été enregistrée. Redémarrez et terminez la configuration."},
    "dlg_xlation_failed": {"en": "Translation failed", "fr": "Échec de la traduction"},
    "dlg_success_title":  {"en": "Success!",            "fr": "Succès !"},
    "dlg_success_q":      {"en": "{n} file(s) translated successfully!\n\nTranslate more files?",
                           "fr": "{n} fichier(s) traduit(s) avec succès !\n\nTraduire d'autres fichiers ?"},
    "dlg_goodbye_title":  {"en": "Thank you",           "fr": "Merci"},
    "dlg_goodbye_msg":    {"en": "Thank you for using EVOQ Spec Translator.\n\nThe application will now close.",
                           "fr": "Merci d'avoir utilisé EVOQ Spec Translator.\n\nL'application va maintenant se fermer."},
    "dlg_no_docx":        {"en": "No files found",      "fr": "Aucun fichier trouvé"},
    "dlg_no_docx_msg":    {"en": "No .docx files found in:\n{folder}",
                           "fr": "Aucun fichier .docx trouvé dans :\n{folder}"},
    "dlg_added_folder":   {"en": "Added {n} file(s) from folder: {folder}",
                           "fr": "{n} fichier(s) ajouté(s) depuis le dossier : {folder}"},

    # Cost estimate
    "est_title":   {"en": "API Cost Estimate",   "fr": "Estimation du coût API"},
    "est_no_files":{"en": "No files",            "fr": "Aucun fichier"},
    "est_no_files_msg":{"en": "Add at least one file first.", "fr": "Ajoutez au moins un fichier."},
    "est_body":    {"en": "{name}:\n  {paras} paragraphs, {chars:,} chars\n  Est. ~{inp:,} input / {out:,} output tokens\n  Est. USD ${cost:.4f} (with prompt caching)",
                   "fr": "{name} :\n  {paras} paragraphes, {chars:,} caractères\n  Est. ~{inp:,} tokens en entrée / {out:,} en sortie\n  Est. USD ${cost:.4f} (avec mise en cache)"},
    "est_total":   {"en": "\nTotal estimated cost: USD ${cost:.4f}", "fr": "\nCoût total estimé : USD ${cost:.4f}"},
    "est_note":    {"en": "(Estimates assume Sonnet 4.6 pricing; actual costs vary.)",
                   "fr": "(Estimations basées sur les tarifs Sonnet 4.6 ; les coûts réels peuvent varier.)"},

    # Cache dialogs
    "cache_empty":     {"en": "Cache empty",    "fr": "Cache vide"},
    "cache_empty_msg": {"en": "Translation cache is already empty.",
                        "fr": "Le cache de traduction est déjà vide."},
    "cache_confirm":   {"en": "Clear cache",    "fr": "Vider le cache"},
    "cache_confirm_msg":{"en":"Delete all {n} cached translation(s)?\n\nThis cannot be undone.",
                         "fr":"Supprimer les {n} traduction(s) en cache ?\n\nCette action est irréversible."},
    "cache_cleared":   {"en": "Cleared",        "fr": "Vidé"},
    "cache_cleared_msg":{"en":"Translation cache cleared.", "fr": "Cache de traduction vidé."},
    "no_lex_msg":      {"en": "Save settings with a valid lexicon path first.",
                        "fr": "Enregistrez d'abord les paramètres avec un chemin de lexique valide."},

    # Lexicon Manager
    "lex_title":    {"en": "Manage Lexicon",      "fr": "Gérer le lexique"},
    "lex_search":   {"en": "Search:",             "fr": "Rechercher :"},
    "lex_col_en":   {"en": "English Term",        "fr": "Terme anglais"},
    "lex_col_fr":   {"en": "French Term",         "fr": "Terme français"},
    "lex_master":   {"en": "Master (read-only)",  "fr": "Référence (lecture seule)"},
    "lex_custom":   {"en": "Custom (new)",        "fr": "Personnalisé (nouveau)"},
    "lex_override": {"en": "Custom override of master", "fr": "Remplacement personnalisé"},
    "lex_count":    {"en": "{shown} of {total} entries ({n} custom)",
                    "fr": "{shown} sur {total} entrées ({n} personnalisées)"},
    "lex_filtered": {"en": "{shown} of {total} shown", "fr": "{shown} sur {total} affichés"},
    "lex_add":      {"en": "Add",    "fr": "Ajouter"},
    "lex_edit":     {"en": "Edit",   "fr": "Modifier"},
    "lex_delete":   {"en": "Delete", "fr": "Supprimer"},
    "lex_save":     {"en": "Save",   "fr": "Enregistrer"},
    "lex_close":    {"en": "Close",  "fr": "Fermer"},
    "lex_add_title":{"en": "Add Custom Term",  "fr": "Ajouter un terme personnalisé"},
    "lex_edit_title":{"en":"Edit Term",        "fr": "Modifier le terme"},
    "lex_ro_title": {"en": "Read-only entry",  "fr": "Entrée en lecture seule"},
    "lex_ro_msg":   {"en": "'{en}' is a master lexicon entry and cannot be deleted.\n\nTo override it, select Edit — your custom value will take precedence during translation.",
                    "fr": "« {en} » est une entrée de référence et ne peut pas être supprimée.\n\nPour la remplacer, cliquez sur Modifier — votre valeur personnalisée sera prioritaire lors de la traduction."},
    "lex_del_override":{"en":"Remove custom override (master entry will be restored)",
                        "fr":"Supprimer le remplacement (l'entrée de référence sera restaurée)"},
    "lex_del_custom":  {"en":"Delete custom entry", "fr":"Supprimer l'entrée personnalisée"},
    "lex_confirm_del": {"en":"Confirm delete",       "fr":"Confirmer la suppression"},
    "lex_nothing":     {"en":"Nothing to save",      "fr":"Rien à enregistrer"},
    "lex_nothing_msg": {"en":"No custom terms have been added.", "fr":"Aucun terme personnalisé n'a été ajouté."},
    "lex_saved":       {"en":"Saved",                "fr":"Enregistré"},
    "lex_saved_msg":   {"en":"{n} custom term(s) saved to:\n{name}",
                        "fr":"{n} terme(s) personnalisé(s) enregistré(s) dans :\n{name}"},
    "lex_save_failed": {"en":"Save failed",          "fr":"Échec de l'enregistrement"},
    "lex_unsaved":     {"en":"Unsaved changes",      "fr":"Modifications non enregistrées"},
    "lex_unsaved_msg": {"en":"Save custom terms before closing?",
                        "fr":"Enregistrer les termes personnalisés avant de fermer ?"},

    # Term dialog
    "term_en":     {"en": "English:", "fr": "Anglais :"},
    "term_fr":     {"en": "French:",  "fr": "Français :"},
    "term_ok":     {"en": "OK",       "fr": "OK"},
    "term_cancel": {"en": "Cancel",   "fr": "Annuler"},
    "term_incomplete":    {"en": "Incomplete",            "fr": "Incomplet"},
    "term_incomplete_msg":{"en": "Both fields are required.", "fr": "Les deux champs sont obligatoires."},

    # Header mode tooltips
    "tip_hdr_full": {
        "en": (
            "Translate headers fully (default)\n\n"
            "All header content — including project name, client name, and section "
            "title — is sent to the Anthropic API for translation.\n\n"
            "Use this mode only when the header contains no confidential information."
        ),
        "fr": (
            "Traduction complète des en-têtes\n\n"
            "Tout le contenu des en-têtes — nom du projet, nom du client, titre de section — "
            "est envoyé à l'API Anthropic pour traduction.\n\n"
            "Utilisez ce mode uniquement si l'en-tête ne contient aucune information confidentielle."
        ),
    },
    "tip_hdr_lex": {
        "en": (
            "Lexicon-only header translation  ✓ Recommended for confidential documents\n\n"
            "Headers are translated using the lexicon only — no API calls are made for "
            "header content. Standard NMS section titles are translated correctly "
            "because they are in the lexicon. Project-specific text (client name, "
            "project name, address) is left in the source language for manual update.\n\n"
            "Nothing in the header is transmitted over the internet."
        ),
        "fr": (
            "Traduction des en-têtes par lexique uniquement  ✓ Recommandé pour les documents confidentiels\n\n"
            "Les en-têtes sont traduits à partir du lexique uniquement — aucun appel API. "
            "Les titres de sections NMS standard sont traduits correctement car ils figurent dans le lexique. "
            "Le texte propre au projet (nom du client, du projet, adresse) est conservé dans la langue source "
            "pour mise à jour manuelle.\n\n"
            "Aucun contenu d'en-tête n'est transmis sur Internet."
        ),
    },
    "tip_hdr_skip": {
        "en": (
            "Skip header translation  ✓ Maximum confidentiality\n\n"
            "Headers are left entirely in the source language. No header content is "
            "sent to the internet. Update the header manually after translation."
        ),
        "fr": (
            "Ignorer la traduction des en-têtes  ✓ Confidentialité maximale\n\n"
            "Les en-têtes sont entièrement conservés dans la langue source. Aucun contenu "
            "d'en-tête n'est envoyé sur Internet. Mettez à jour l'en-tête manuellement après la traduction."
        ),
    },
}

_lang = "en"


def set_lang(lang: str) -> None:
    global _lang
    _lang = lang if lang in ("en", "fr") else "en"


def get_lang() -> str:
    return _lang


def t(key: str, **kwargs) -> str:
    entry = _S.get(key, {})
    text = entry.get(_lang) or entry.get("en") or key
    if kwargs:
        try:
            text = text.format(**kwargs)
        except (KeyError, ValueError):
            pass
    return text
