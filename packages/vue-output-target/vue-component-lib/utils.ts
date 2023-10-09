// @ts-nocheck
// It's easier and safer for Volar to disable typechecking and let the return type inference do its job.
import { VNode, defineComponent, getCurrentInstance, h, inject, ref, Ref } from 'vue';

export interface InputProps<T> {
  modelValue?: T;
}

const UPDATE_VALUE_EVENT = 'update:modelValue';
const MODEL_VALUE = 'modelValue';
const ROUTER_LINK_VALUE = 'routerLink';
const NAV_MANAGER = 'navManager';
const ROUTER_PROP_PREFIX = 'router';
const ARIA_PROP_PREFIX = 'aria';
/**
 * Starting in Vue 3.1.0, all properties are
 * added as keys to the props object, even if
 * they are not being used. In order to correctly
 * account for both value props and v-model props,
 * we need to check if the key exists for Vue <3.1.0
 * and then check if it is not undefined for Vue >= 3.1.0.
 * See https://github.com/vuejs/vue-next/issues/3889
 */
const EMPTY_PROP = Symbol();
const DEFAULT_EMPTY_PROP = { default: EMPTY_PROP };

interface NavManager<T = any> {
  navigate: (options: T) => void;
}

const getComponentClasses = (classes: unknown) => {
  return (classes as string)?.split(' ') || [];
};

const getElementClasses = (
  ref: Ref<HTMLElement | undefined>,
  componentClasses: Set<string>,
  defaultClasses: string[] = []
) => {
  return [...Array.from(ref.value?.classList || []), ...defaultClasses].filter(
    (c: string, i, self) => !componentClasses.has(c) && self.indexOf(c) === i
  );
};

/**
 * Utility function to define a Vue wrapper component for a Web Component.
 * @param {string} name - The tag name of the Web Component (e.g., 'gravity-button').
 * @param {Function} defineCustomElement - Function to define the Web Component.
 * @param {Array} componentProps - Array of properties and custom events supported by the Web Component.
 * @param {string} [modelProp] - Prop that v-model binds to (optional).
 * @param {string} [modelUpdateEvent] - Event that triggers a model update (optional).
 * @param {string} [externalModelUpdateEvent] - External event to fire when the model is updated (optional).
 */
export const defineContainer = <Props, VModelType = string | number | boolean>(
  name: string,
  defineCustomElement: any,
  componentProps: string[][] = [],
  modelProp?: string,
  modelUpdateEvent?: string,
  externalModelUpdateEvent?: string
) => {
  /**
   * Create a Vue component wrapper around a Web Component.
   * Note: The `props` here are not all properties on a component.
   * They refer to whatever properties are set on an instance of a component.
   */

  if (defineCustomElement !== undefined) {
    defineCustomElement();
  }

  // Destructure the array of component properties and custom events
  const [componentProperties, componentCustomEvents] = componentProps;

  /**
   * Vue component wrapper around the Web Component.
   * Handles property binding, event handling, and v-model support.
   */
  const Container = defineComponent<Props & InputProps<VModelType>>((props, { attrs, slots, emit }) => {
    let modelPropValue = props[modelProp];
    const containerRef = ref<HTMLElement>();
    const classes = new Set(getComponentClasses(attrs.class));
    const onVnodeBeforeMount = (vnode: VNode) => {
      // Add a listener to tell Vue to update the v-model
      if (vnode.el) {
        if (modelUpdateEvent) {
          const eventsNames = Array.isArray(modelUpdateEvent) ? modelUpdateEvent : [modelUpdateEvent];
          eventsNames.forEach((eventName: string) => {
            vnode.el!.addEventListener(eventName, (e: Event) => {
              modelPropValue = (e?.target as any)[modelProp];
              emit(UPDATE_VALUE_EVENT, modelPropValue);

              /**
               * We need to emit the change event here
               * rather than on the web component to ensure
               * that any v-model bindings have been updated.
               * Otherwise, the developer will listen on the
               * native web component, but the v-model will
               * not have been updated yet.
               */
              if (externalModelUpdateEvent) {
                emit(externalModelUpdateEvent, e);
              }
            });
          });
        }

        /**
         * Attach event listeners for custom events emitted by the web component.
         * This makes custom events accessible for declarative inline event handlers using both camelCase and kebab-case.
         *
         * Example:
         * If the StencilJS component emits an event called "customEvent",
         * then both `@customEvent` and `@custom-event` can be used as inline handlers.
         */
        if (componentCustomEvents?.length) {
          componentCustomEvents.forEach((eventName) => {
            vnode.el.addEventListener(eventName, (e: CustomEvent) => {
              emit(eventName, e);
            });
          });
        }
      }
    };

    const currentInstance = getCurrentInstance();
    const hasRouter = currentInstance?.appContext?.provides[NAV_MANAGER];
    const navManager: NavManager | undefined = hasRouter ? inject(NAV_MANAGER) : undefined;
    const handleRouterLink = (ev: Event) => {
      const { routerLink } = props;
      if (routerLink === EMPTY_PROP) return;

      if (navManager !== undefined) {
        let navigationPayload: any = { event: ev };
        for (const key in props) {
          const value = props[key];
          if (props.hasOwnProperty(key) && key.startsWith(ROUTER_PROP_PREFIX) && value !== EMPTY_PROP) {
            navigationPayload[key] = value;
          }
        }

        navManager.navigate(navigationPayload);
      } else {
        console.warn('Tried to navigate, but no router was found. Make sure you have mounted Vue Router.');
      }
    };

    return () => {
      modelPropValue = props[modelProp];

      getComponentClasses(attrs.class).forEach((value) => {
        classes.add(value);
      });

      const oldClick = props.onClick;
      const handleClick = (ev: Event) => {
        if (oldClick !== undefined) {
          oldClick(ev);
        }
        if (!ev.defaultPrevented) {
          handleRouterLink(ev);
        }
      };

      let propsToAdd: any = {
        ref: containerRef,
        class: getElementClasses(containerRef, classes),
        onClick: handleClick,
        onVnodeBeforeMount,
      };

      /**
       * We can use Object.entries here
       * to avoid the hasOwnProperty check,
       * but that would require 2 iterations
       * where as this only requires 1.
       */
      for (const key in props) {
        const value = props[key];
        if ((props.hasOwnProperty(key) && value !== EMPTY_PROP) || key.startsWith(ARIA_PROP_PREFIX)) {
          propsToAdd[key] = value;
        }
      }

      if (modelProp) {
        /**
         * If form value property was set using v-model
         * then we should use that value.
         * Otherwise, check to see if form value property
         * was set as a static value (i.e. no v-model).
         */
        if (props[MODEL_VALUE] !== EMPTY_PROP) {
          propsToAdd = {
            ...propsToAdd,
            [modelProp]: props[MODEL_VALUE],
          };
        } else if (modelPropValue !== EMPTY_PROP) {
          propsToAdd = {
            ...propsToAdd,
            [modelProp]: modelPropValue,
          };
        }
      }

      return h(name, propsToAdd, slots.default && slots.default());
    };
  });

  if (typeof Container !== 'function') {
    Container.name = name;

    Container.props = {
      [ROUTER_LINK_VALUE]: DEFAULT_EMPTY_PROP,
    };

    // Map properties to proxy component for one-way data binding.
    if (componentProperties?.length) {
      componentProperties.forEach((componentProp) => {
        Container.props[componentProp] = DEFAULT_EMPTY_PROP;
      });
    }

    // Register custom events as Vue emits.
    if (componentCustomEvents?.length) {
      Container.emits = [...(Array.isArray(Container.emits) ? Container.emits : []), ...componentCustomEvents];
    }

    if (modelProp) {
      Container.props[MODEL_VALUE] = DEFAULT_EMPTY_PROP;
      Container.emits = [
        ...(Array.isArray(Container.emits) ? Container.emits : []),
        UPDATE_VALUE_EVENT,
        externalModelUpdateEvent,
      ];
    }
  }

  return Container;
};
