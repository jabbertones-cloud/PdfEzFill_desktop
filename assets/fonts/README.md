# Bundled fill font

`NotoSansSC.ttf` — Noto Sans SC (variable font, TrueType), Copyright
2014-2021 Adobe, licensed under the SIL Open Font License, Version 1.1
(full text in `OFL.txt` alongside it). Source: the Google Fonts
repository (`ofl/notosanssc`).

Why it ships with the app: the PDF renderer embeds this font (subsetted
per document) to generate AcroForm field appearances and text overlays.
The PDF built-in Helvetica (WinAnsi) cannot encode CJK or many accented
characters — filled values in those scripts used to make generation fail
entirely. Field *values* are always stored exactly as entered; this font
only affects how values are drawn.
