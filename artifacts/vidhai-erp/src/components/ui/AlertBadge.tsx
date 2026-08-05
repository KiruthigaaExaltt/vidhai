import { useListAlertColors } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export function AlertBadge({ condition, label, defaultColor = "bg-gray-100 text-gray-800" }: { condition: string, label: string, defaultColor?: string }) {
  const { data: alertColors } = useListAlertColors({ query: { staleTime: 1000 * 60 * 5 } } as any); // cache for 5 mins
  
  const colorMatch = alertColors?.find(c => c.condition === condition || c.name.toLowerCase() === condition.toLowerCase());
  
  if (colorMatch) {
    return (
      <Badge variant="outline" className="border-0 rounded-sm font-mono text-[11px]" style={{ backgroundColor: colorMatch.hexColor, color: getContrastYIQ(colorMatch.hexColor) }}>
        {label}
      </Badge>
    );
  }

  // Fallbacks
  const fallbacks: Record<string, string> = {
    'normal': 'bg-primary text-primary-foreground',
    'warning': 'bg-amber-500 text-white',
    'critical': 'bg-destructive text-destructive-foreground',
    'active': 'bg-primary text-primary-foreground',
    'completed': 'bg-gray-200 text-gray-800',
    'failed': 'bg-destructive text-destructive-foreground',
    'on_hold': 'bg-amber-500 text-white',
  };

  const matchedFallback = fallbacks[condition.toLowerCase()] || fallbacks[label.toLowerCase()] || defaultColor;

  return (
    <Badge variant="outline" className={`border-0 rounded-sm font-mono text-[11px] ${matchedFallback}`}>
      {label}
    </Badge>
  );
}

// Helper to determine text color based on background
function getContrastYIQ(hexcolor: string){
  hexcolor = hexcolor.replace("#", "");
  if (hexcolor.length === 3) {
    hexcolor = hexcolor.split('').map(h => h + h).join('');
  }
  const r = parseInt(hexcolor.substr(0,2),16);
  const g = parseInt(hexcolor.substr(2,2),16);
  const b = parseInt(hexcolor.substr(4,2),16);
  const yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}
