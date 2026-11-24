import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// Our runner image has a Chrome headless shell baked in: use it instead of downloading one per film.
if (process.env.REMOTION_CHROME) Config.setBrowserExecutable(process.env.REMOTION_CHROME);
