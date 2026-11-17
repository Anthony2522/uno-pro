import type {SVGProps} from "react";

/** Original vector artwork: unmistakably a cockroach (antennae, wings, 6 legs).
 * Uses currentColor so it inherits each colored card's contrasting ink.
 * No letters, symbols or printed words are part of the icon. */
export function CockroachIcon(props:SVGProps<SVGSVGElement>){
  return <svg viewBox="0 0 100 120" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {/* Long, curved antennae */}
    <path d="M45 31C34 13 18 6 5 9M55 31C68 12 81 7 95 13" strokeWidth="3.6"/>
    <path d="M43 25C36 15 28 11 21 11M57 25C65 16 74 15 80 16" strokeWidth="2" opacity=".7"/>
    {/* Three pairs of jointed legs */}
    <g strokeWidth="5">
      <path d="M38 49 23 40 11 48 4 61"/>
      <path d="M62 49 77 40 89 48 96 61"/>
      <path d="M35 64 19 65 12 80 6 87"/>
      <path d="M65 64 81 65 88 80 94 87"/>
      <path d="M38 83 24 96 24 109 18 117"/>
      <path d="M62 83 76 96 76 109 82 117"/>
    </g>
    {/* Spiky tips on tibia */}
    <g strokeWidth="2.2">
      <path d="M13 79 5 77M88 80 96 77M22 104 13 102M78 104 87 102"/>
    </g>
    {/* Head, armored thorax and tapering abdomen */}
    <path d="M42 24Q50 15 58 24L60 35Q50 42 40 35Z" fill="currentColor" strokeWidth="2.2"/>
    <path d="M33 38Q50 28 67 38L65 55Q50 64 35 55Z" fill="currentColor" strokeWidth="2.5"/>
    <path d="M34 53Q50 44 66 53Q74 82 58 106Q50 113 42 106Q26 82 34 53Z" fill="currentColor" strokeWidth="2.8"/>
    {/* Wing division and overlapping shell plates */}
    <path d="M50 50Q45 78 50 105" stroke="var(--cockroach-wing-line,white)" strokeWidth="3" opacity=".85"/>
    <path d="M36 63Q42 65 46 70M64 63Q58 65 54 70M34 75Q40 80 46 83M66 75Q60 80 54 83M39 91Q43 95 47 97M61 91Q57 95 53 97"
      stroke="var(--cockroach-wing-line,white)" strokeWidth="2" opacity=".55"/>
    {/* Visible small eyes */}
    <circle cx="40" cy="27" r="2" fill="var(--cockroach-wing-line,white)" stroke="none"/>
    <circle cx="60" cy="27" r="2" fill="var(--cockroach-wing-line,white)" stroke="none"/>
  </svg>;
}
