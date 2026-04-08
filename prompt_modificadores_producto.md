<prompt>
Actúas como un Lead Developer o Senior Frontend Engineer experto en React, TypeScript y Firebase (Firestore). Tu objetivo es diseñar e implementar la estructura de datos y la interfaz de usuario para una nueva funcionalidad en nuestra aplicación de delivery de comida ("Deliexpress").

# Contexto del Proyecto
La aplicación consta de tres partes principales (Customer App, Restaurant Panel y CPanel para Superadmins). El frontend está construido con React (posiblemente Vite/Next.js) y TailwindCSS, mientras que el backend usa Firebase Firestore y Storage.

# Objetivo de la Funcionalidad a Desarrollar
Necesitamos expandir el sistema actual de "Gestión de Productos" para permitir a los restaurantes agregar "Modificadores de Producto". Cuando un usuario de la aplicación final seleccione un platillo (ej. una hamburguesa), debe poder personalizar su pedido mediante varias opciones.

Los tipos de modificadores requeridos son:

1.  **Bebida con tu Combo (Opcional o Requerido):**
    *   Una lista seleccionable donde el usuario puede escoger una bebida para acompañar su plato (ej. Refresco, Jugo, Agua).
    *   *Nota para el panel:* El administrador del restaurante debe poder activar/desactivar qué bebidas están disponibles en su inventario para aplicar a los combos.
2.  **Extras (Selección Múltiple con costo adicional):**
    *   Ingredientes adicionales que suman al precio base (ej. "Extra Queso +$1.50", "Ración de Papas Fritas +$2.00", "Sabor extra").
3.  **Preferencias / Sin Ingredientes (Selección Múltiple sin costo):**
    *   Una lista de ingredientes que el usuario puede elegir omitir (ej. "Sin lechuga", "Sin tomate", "Sin mayonesa").
4.  **Instrucciones Adicionales (Campo de Texto Libre):**
    *   Un input text/textarea donde el usuario puede escribir peticiones especiales o alergias (ej. "Tocar el timbre al llegar" o "Bien cocido").

# Tareas para el Programador (Implementación Técnica)

## 1. Actualización del Modelo de Datos (Firestore)
Define e implementa el esquema de base de datos necesario para soportar estos modificadores. 
*Sugerencia:* Modifica la interfaz (interface) actual de `Product` para incluir un array o un objeto de `modifiers` que contenga:
*   `type`: (e.g., 'beverage', 'extra', 'preference')
*   `name`: Nombre de la opción (ej. "Bebidas", "Añade un Extra")
*   `required`: boolean (especialmente útil si el combo requiere sí o sí seleccionar una bebida)
*   `maxSelections`: number (para limitar cuántos extras o bebidas se pueden elegir)
*   `options`: Array de sub-opciones `{ id, name, price, isAvailable, type }`.

Asegúrate de que la estructura sea escalable y fácil de leer/escribir mediante los métodos `updateDoc` y `addDoc` que ya usamos.

## 2. Actualización en el Panel de Administración (Restaurant Panel)
En la pantalla de gestión de productos (`ProductManagement.tsx` o similar):
*   Crea una nueva sección dentro del modal de "Añadir/Editar Producto" dedicada a "Opciones Adicionales / Modificadores".
*   Permite al dueño del restaurante o administrador hacer CRUD (Crear, Leer, Actualizar, Borrar) sobre las opciones de Bebidas, Extras y Preferencias *para ese producto en específico*.
*   Incluye un *toggle* (interruptor) de disponibilidad rápida para las opciones, de modo que si un día se quedan sin "Refresco Cola", puedan apagar esa opción particular sin borrarla de la lista de bebidas.

## 3. Actualización de la Interfaz del Usuario (Customer App)
En la vista donde el usuario ve el detalle del producto antes de agregarlo al carrito:
*   Genera un componente que renderice dinámicamente estos modificadores basándose en la configuración del producto.
*   **Bebidas:** Puede ser un Radio Button group o un Select dropdown si es obligatorio elegir una, o Checkboxes si hay límite pero no es estricto.
*   **Extras / Preferencias:** Renderizar como grupos de Checkboxes.
*   **Instrucciones:** Agrega un `textarea` limpio al final bajo el título "Instrucciones Adicionales".
*   *Lógica de Precios:* El precio total en el botón "Agregar al Carrito" debe recalcularse en tiempo real (Precio base + (Precio Extra 1 * Cantidad) + ...).

## 4. Actualización del Objeto de "CartItem" y "Orders"
Asegúrate de que el objeto que se envía a la colección de carritos (`cart`) y pedidos (`orders`) incluya estos modificadores de forma clara para que el restaurante sepa exactamente qué preparar. 
Ejemplo de estructura en el carrito:
```json
{
  "productId": "xyz",
  "quantity": 1,
  "basePrice": 10,
  "totalPrice": 12.5,
  "selectedBeverage": "Refresco Cola",
  "selectedExtras": [{ "name": "Extra Queso", "price": 1.5 }, { "name": "Bacon", "price": 1.0 }],
  "removedIngredients": ["Sin tomate", "Sin cebolla"],
  "specialInstructions": "Por favor, la carne bien cocida."
}
```

# Entregables Esperados
1.  **Interfaces TypeScript actualizadas** (ej. `ProductModifier`, `CartModifierItem`).
2.  **Fragmentos de Componentes en React** detallando la UI tanto para el panel de administración (formulario de modificadores) como para el Customer App (selección antes de agregar al carrito).
3.  **Lógica de estado** gestionando el cálculo dinámico del precio según los extras seleccionados.

Por favor, mantén un código limpio, usa hooks (`useState`, `useEffect`), maneja posibles errores (ej. un usuario seleccionando más extras del máximo permitido) y utiliza estilos (TailwindCSS) coherentes con un diseño moderno.
</prompt>
