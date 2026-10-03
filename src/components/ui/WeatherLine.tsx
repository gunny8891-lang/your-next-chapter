import { describeWeather, type TodayWeather } from "@/lib/nudges/weather";
import styles from "@/components/ui/ui.module.css";

/** "19° · Dry today". Renders nothing when there is no forecast, rather than a gap or an error. */
export function WeatherLine({ weather }: { weather: TodayWeather }) {
  const text = describeWeather(weather);
  if (!text) return null;
  return (
    <span className={styles.weather}>
      <span className={styles.weatherTemp}>{text.temperature}</span>
      <span aria-hidden="true">·</span>
      <span>{text.summary}</span>
    </span>
  );
}
