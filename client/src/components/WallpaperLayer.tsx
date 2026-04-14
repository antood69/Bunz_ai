import { useTheme } from "@/contexts/ThemeContext";

export default function WallpaperLayer() {
  const { wallpaperUrl, wallpaperType, wallpaperTint } = useTheme();

  if (!wallpaperUrl || wallpaperType === "none") return null;

  return (
    <>
      {/* Background image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${wallpaperUrl})` }}
      />
      {/* Tint overlay */}
      <div
        className="fixed inset-0 z-[1]"
        style={{ background: `rgba(0,0,0,${wallpaperTint})` }}
      />
    </>
  );
}
