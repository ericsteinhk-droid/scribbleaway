"""Prompt fragments and assembly.

Everything a user can steer is a constant in this module so the wording can be
tuned without touching any UI code. Order of the list also defines the order the
checkboxes appear in the window.
"""

# (label shown to the user, instruction fragment sent to the model)
CHECKBOX_FRAGMENTS = [
    ("Construction cones & barriers",
     "remove all traffic cones, safety barriers, and temporary fencing"),
    ("Scaffolding & ladders",
     "remove scaffolding, ladders, and access platforms"),
    ("Building materials & debris",
     "remove piles of building materials, rubble, debris, and stacked supplies"),
    ("Cars & parked vehicles",
     "remove parked cars and vehicles from the street and forecourt"),
    ("Trucks & heavy machinery",
     "remove construction trucks, diggers, cranes, and heavy machinery"),
    ("Portable toilets & site cabins",
     "remove portable toilets, site cabins, and temporary containers"),
    ("Signage & banners",
     "remove construction signage, hoarding graphics, and banners"),
    ("People",
     "remove people and pedestrians"),
]

# Kept deliberately separate from the fragments; always appended last.
PRESERVATION_CLAUSE = (
    "Preserve the building, sky, landscaping, and all permanent architectural "
    "features exactly as they are."
)

# Short lead-in so the model knows the task type. Editable.
LEAD_IN = "Edit this photograph of a building to clean up the construction site."


def assemble_instruction(fragments, free_text):
    """Join checked fragments, append free text, then append the preservation clause.

    ``fragments`` is a list of instruction fragments (not labels). ``free_text``
    is the user's free-text box contents. Returns the full instruction string.
    """
    segments = [LEAD_IN]
    segments.extend(f.strip() for f in fragments if f and f.strip())

    free_text = (free_text or "").strip()
    if free_text:
        segments.append(free_text)

    # Normalise so each segment ends with a single period.
    body = " ".join(s.rstrip(".") + "." for s in segments)
    return f"{body} {PRESERVATION_CLAUSE}".strip()


def has_any_instruction(fragments, free_text):
    """True if the user selected at least one checkbox or typed free text."""
    if any(f and f.strip() for f in fragments):
        return True
    return bool((free_text or "").strip())
