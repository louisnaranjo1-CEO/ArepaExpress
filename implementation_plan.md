# Implementación de Modificadores de Producto

Este plan describe los cambios técnicos necesarios para introducir el sistema de modificadores de productos (Bebidas, Extras, Preferencias e Instrucciones) que permiten al usuario personalizar sus compras y al restaurante gestionar dichas opciones.

## User Review Required

> [!IMPORTANT]
> **Aprobación de la Estructura de Datos**
> He estructurado los modificadores para que el restaurante pueda crear múltiples "bloques" y elegir si son del tipo "bebida", "extra", "preferencia" (sin costo) o "instrucción" (texto). Por favor, lee la sección de **Cambios Propuestos** para confirmar si la lógica en el carrito te parece bien.
>
> **¿Estás de acuerdo con proceder con esta implementación paso a paso?**

## Proposed Changes

---

### Shared Data Types (Backend/Frontend)
Añadiremos los tipos necesarios en la base del código.

#### [MODIFY] `src/lib/seed.ts` (o archivo de Types central)
- Ampliaremos la interfaz `Product`.
- Añadiremos las interfaces para `ProductModifier` y `ProductModifierOption`.
  ```typescript
  export type ModifierType = 'beverage' | 'extra' | 'preference' | 'instruction';
  
  export interface ProductModifierOption {
      id: string;      // ej. 'opt-1'
      name: string;    // ej. 'Extra Queso'
      price: number;   // ej. 1.50
      isAvailable: boolean;
  }
  
  export interface ProductModifier {
      id: string;
      type: ModifierType;
      name: string;
      required: boolean;
      maxSelections?: number;
      options: ProductModifierOption[];
  }
  ```

---

### Admin / Control Panel
La interfaz mediante la cual el restaurante configurará estos modificadores por producto.

#### [MODIFY] `src/admin/pages/ProductManagement.tsx`
- Añadiremos una sección debajo de "Presentaciones" (Variants) en el formulario de productos.
- Esta sección permitirá anidar menús para:
  1. **Crear** un nuevo bloque de modificador (ej. Grupo "Tipos de Bebida", Grupo "Salsas").
  2. **Añadir opciones** dentro del bloque (ej. "Coca Cola", "Pepsi" con sus respectivos precios si aplica).
  3. **Visibilidad**: Contenedores para activar o desactivar una sub-opción si el stock se acaba.

---

### Frontend / Customer Experience
Actualizaremos cómo el usuario ve el menú y añade el producto al carrito.

#### [MODIFY] `src/context/CartContext.tsx`
- Expandiremos `CartItem` para incluir los detalles elegidos por el usuario, almacenándolos en la propiedad temporal y local del carrito: `modifiersConfig`.
- Actualizaremos la lógica `calculateTotalPrice` para sumar el valor de los extras seleccionados (ej. Base $10 + Extra Queso $1.50 = $11.50 por cantidad).

#### [MODIFY] `src/pages/Restaurant.tsx`
- En el **Modal de Detalles del Producto**, procesaremos el objeto `modifiers` proveniente de la base de datos para renderizar la interfaz dinámicamente:
  - `beverage` / `extra` -> Si `maxSelections == 1` usa `radios`, en caso contrario usa `checkboxes`.
  - `preference` -> `checkboxes` (sin precio).
  - `instruction` -> Un campo `<textarea>` para dar cabida a instrucciones libres.
- Manejo de state `selectedModifiers` validando reglas como selecciones máximas o requisitos (`required`).

#### [MODIFY] `src/pages/Cart.tsx` (y posibles vistas de cajeros/cocina)
- Dentro de la tarjeta de renderizado del carrito (donde ahora se ven precios y presentación), añadiremos un sub-panel pequeño o en gris listando:
  - *Extras:* Extra queso, Coca Cola.
  - *Sin:* Cebolla.
  - *Nota:* Tocar timbre.

## Open Questions

> [!WARNING]
> ¿Deseas obligar que para los modificadores tipo "Instrucciones", el restaurante obligatoriamente pre-defina el texto ("Instrucciones Adicionales") o implementamos la flexibilidad para que los puedan nombrar como quieran, por ejemplo: "Dedicatoria para tarjeta"? 

## Verification Plan

### Manual Verification
1. Ingresaré al Panel Administrativo y crearé un producto de prueba llamado "Combo Hambuguesa Completa" con:
   - 1 Bebida (Coca Cola $1, Sprite $0, obligatoria).
   - 1 Extra (Queso $1.5).
   - 1 Preferencia (Sin lechuga).
   - 1 Texto de instrucción.
2. Como cliente simulado, abriré el restaurante, y seleccionaré la hamburguesa abriendo el Modal para validar si pinta bien las opciones limitantes.
3. Se seleccionará de todo, verificaré si el cálculo del total precio se suma con exactitud antes de añadir al carrito.
4. Veré en la página del carrito (`/cart`) si mis modificaciones persisten visualmente en el desglose.
