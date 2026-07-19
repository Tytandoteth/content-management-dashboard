import {
  LayoutDashboard, Inbox, Calendar, BookOpenCheck, FileStack, Cpu, Settings,
  Sparkles, Zap, Eye, Check, X, Clock, Send, Activity, Lightbulb, Pencil,
  ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Link2, Shield, TrendingUp, Play,
  Search, Command, Sun, Moon, Bell, Menu, RefreshCw, Pencil as Edit, Ban,
  AlertTriangle, Plus, MessageSquare, AlignLeft, Scissors, GalleryHorizontal,
  Film, FileText, type LucideIcon,
} from "lucide-react";

/**
 * Maps the design's glyph names to lucide icons so the ported components keep
 * their original `name=` API. Falls back to a neutral dot.
 */
const MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, inbox: Inbox, calendar: Calendar, recipes: BookOpenCheck,
  content: FileStack, engines: Cpu, settings: Settings,
  sparkles: Sparkles, bolt: Zap, eye: Eye, check: Check, x: X, clock: Clock,
  send: Send, activity: Activity, lightbulb: Lightbulb, pencil: Pencil,
  arrowRight: ArrowRight, arrowUpRight: ArrowUpRight, chevronLeft: ChevronLeft, chevronRight: ChevronRight,
  link: Link2, shield: Shield, trend: TrendingUp, play: Play, search: Search,
  command: Command, sun: Sun, moon: Moon, bell: Bell, list: Menu, refresh: RefreshCw,
  cpu: Cpu, edit: Edit, ban: Ban, alert: AlertTriangle, plus: Plus,
  // content type glyphs
  tweet: MessageSquare, thread: AlignLeft, clip: Scissors, carousel: GalleryHorizontal,
  video: Film, post: FileText,
};

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Cmp = (name && MAP[name]) || Activity;
  return <Cmp size={size} className={className} style={style} strokeWidth={1.9} aria-hidden />;
}
