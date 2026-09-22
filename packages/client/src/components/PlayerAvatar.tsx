/**
 * La identidad visual de un jugador: un circulo con su inicial.
 *
 * El color sale del `seat`, NO de un hash del nickname, y la diferencia
 * importa: con 10 asientos y 10 colores, derivar del asiento **garantiza** que
 * dos jugadores nunca compartan color. Un hash del nombre no lo garantiza —
 * dos nicks distintos pueden colisionar, y justo en una mesa llena, que es
 * donde el color hace falta.
 *
 * Ademas el asiento es estable: si alguien se cambia el nombre a mitad de
 * partida, sigue siendo la misma persona del mismo color.
 *
 * `seat` ya viene en `RedactedPlayer` y en `RedactedRoomState`, asi que esto
 * no pide nada nuevo al servidor.
 */

/**
 * Diez tonos separados en el circulo cromatico.
 *
 * Elegidos a mano y no generados con `hsl(seat * 36)`: un barrido parejo de
 * matiz da verdes y azules contiguos que sobre el fieltro se confunden entre
 * si. Estos saltan de familia en familia a proposito, y ninguno es el verde
 * del fieltro.
 */
const SEAT_COLORS = [
  '#E8552F', // naranja quemado
  '#4A9EE8', // celeste
  '#E8C04A', // mostaza
  '#9B6BD6', // violeta
  '#3FBFA0', // verde agua
  '#E86FA8', // rosa
  '#7FA8E8', // azul claro
  '#D68B4A', // ocre
  '#6FD65E', // verde lima
  '#E85F5F', // rojo coral
] as const;

export type AvatarSize = 'sm' | 'md';

export interface PlayerAvatarProps {
  nickname: string;
  seat: number;
  size?: AvatarSize;
  /** Atenuado: el jugador se fue o esta desconectado. */
  dimmed?: boolean;
}

const BOX: Record<AvatarSize, string> = {
  sm: 'h-6 w-6 text-micro',
  md: 'h-8 w-8 text-mini',
};

/**
 * La inicial.
 *
 * `[...nickname]` y no `nickname[0]`: con un nickname que arranca con emoji,
 * indexar por posicion parte el caracter al medio y muestra un rombo negro.
 */
function initial(nickname: string): string {
  const first = [...nickname.trim()][0];
  return first ? first.toUpperCase() : '?';
}

export function PlayerAvatar({
  nickname,
  seat,
  size = 'md',
  dimmed = false,
}: PlayerAvatarProps): JSX.Element {
  // Modulo por si algun dia hay mas asientos que colores.
  const color = SEAT_COLORS[seat % SEAT_COLORS.length]!;

  return (
    <span
      aria-hidden
      title={nickname}
      className={`${BOX[size]} flex shrink-0 select-none items-center justify-center rounded-full
                  font-display font-black text-brand-ink ${dimmed ? 'opacity-40' : ''}`}
      style={{ backgroundColor: color }}
    >
      {initial(nickname)}
    </span>
  );
}
