// Empty starter: only the setup. Size, fps, length, scenes and look are the film's own choice.
import { Composition } from 'remotion';
import { Film } from './Film';

export const Root = () => (
  <Composition id="Film" component={Film} width={1920} height={1080} fps={30} durationInFrames={90} />
);
