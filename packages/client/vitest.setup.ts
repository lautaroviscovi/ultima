import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Desmontar lo renderizado entre test y test.
 *
 * Testing Library limpia sola SOLO con `globals: true`, que este repo no usa
 * (los `describe`/`it` se importan explicitamente). Sin esto, cada `render`
 * se acumula en el `document.body`, y `screen` —que busca en todo el body, no
 * en el resultado del ultimo render— encuentra nodos de tests anteriores.
 *
 * El modo de falla es traicionero: los tests que verifican que algo NO esta
 * empiezan a fallar por culpa de un test PREVIO que si lo renderizo, asi que
 * el error aparece en el test equivocado. Paso exactamente eso con los
 * botones de `HandActions`.
 *
 * Vive en `packages/client` y no en la raiz porque `@testing-library/react`
 * es dependencia de este paquete: desde la raiz no resuelve.
 */
afterEach(() => {
  cleanup();
});
