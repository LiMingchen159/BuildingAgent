export const DEFAULT_LATEX_TEMPLATE_ID = "building-performance-default" as const;
export const DEFAULT_LATEX_TEMPLATE_VERSION = "1.0.0" as const;

const DEFAULT_LATEX_PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[a4paper,top=18mm,bottom=18mm,left=19mm,right=19mm,headheight=15pt]{geometry}
\usepackage{fontspec}
\usepackage{xeCJK}
\usepackage{graphicx}
\usepackage{array}
\usepackage{tabularx}
\usepackage{booktabs}
\usepackage[table]{xcolor}
\usepackage{enumitem}
\usepackage[unicode,hidelinks]{hyperref}
\usepackage{fancyhdr}

\defaultfontfeatures{Ligatures=TeX}
\setmainfont{Noto Serif CJK SC}
\setsansfont{Noto Sans CJK SC}
\setmonofont{DejaVu Sans Mono}
\setCJKmainfont{Noto Serif CJK SC}
\setCJKsansfont{Noto Sans CJK SC}
\setCJKmonofont{Noto Sans Mono CJK SC}

\definecolor{BAInk}{HTML}{172033}
\definecolor{BAMuted}{HTML}{52627A}
\definecolor{BAAccent}{HTML}{0F766E}
\definecolor{BALine}{HTML}{CBD5E1}
\definecolor{BASurface}{HTML}{F8FAFC}
\definecolor{BAWarning}{HTML}{92400E}
\definecolor{BAWarningSurface}{HTML}{FFF7DB}

\hypersetup{
  pdftitle={Building Performance Report},
  pdfcreator={BuildingAgent deterministic LaTeX renderer},
  pdfproducer={XeLaTeX},
  colorlinks=false
}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\sffamily\small\color{BAMuted}Building Performance Report}
\fancyhead[R]{\sffamily\small\color{BAMuted}BuildingAgent}
\fancyfoot[C]{\sffamily\small\color{BAMuted}\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{BALine}\leaders\hrule height \headrulewidth\hfill}}

\setlength{\parindent}{0pt}
\setlength{\parskip}{0.65em}
\setlength{\emergencystretch}{3em}
\setlist[itemize]{leftmargin=1.4em,itemsep=0.35em,topsep=0.35em}
\renewcommand{\arraystretch}{1.22}

\newcommand{\BAStatusBox}[1]{%
  \par\smallskip
  \noindent\fcolorbox{BALine}{BASurface}{%
    \parbox{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}{\sffamily\small\color{BAMuted}#1}%
  }%
  \par\smallskip
}

\newcommand{\BAWarningBox}[1]{%
  \par\smallskip
  \noindent\fcolorbox{BAWarning}{BAWarningSurface}{%
    \parbox{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}{\sffamily\small\color{BAWarning}#1}%
  }%
  \par\smallskip
}

\newcommand{\BAKpiItem}[2]{%
  \noindent\fcolorbox{BALine}{BASurface}{%
    \parbox{\dimexpr\linewidth-2\fboxsep-2\fboxrule\relax}{%
      {\sffamily\small\color{BAMuted}#1\par}%
      \vspace{0.2em}{\sffamily\bfseries\large\color{BAInk}#2\par}%
    }%
  }%
  \par\smallskip
}

\newcommand{\BAInlineFact}[1]{%
  \begingroup\sffamily\bfseries\color{BAInk}#1\endgroup
}

\newcommand{\BAFigure}[2]{%
  \begin{figure}[htbp]
    \centering
    \includegraphics[width=\linewidth,height=0.42\textheight,keepaspectratio]{#1}
    \if\relax\detokenize{#2}\relax\else\caption{#2}\fi
  \end{figure}
}

\newcolumntype{L}{>{\raggedright\arraybackslash}X}
\newcolumntype{C}{>{\centering\arraybackslash}X}
\newcolumntype{R}{>{\raggedleft\arraybackslash}X}

\AtBeginDocument{\color{BAInk}}
\begin{document}`;

const DEFAULT_LATEX_POSTAMBLE = String.raw`\end{document}`;

/** The caller must supply renderer-generated LaTeX only; no external text enters this template directly. */
export function applyDefaultLatexTemplate(body: string): string {
  return `${DEFAULT_LATEX_PREAMBLE}\n${body}\n${DEFAULT_LATEX_POSTAMBLE}\n`;
}
