import path from 'path';
import { OutputTargetReact } from './types';
import { dashToPascalCase, readPackageJson, relativeImport, sortBy } from './utils';
import { CompilerCtx, ComponentCompilerMeta, Config } from '@stencil/core/internal';

export async function reactProxyOutput(compilerCtx: CompilerCtx, outputTarget: OutputTargetReact, components: ComponentCompilerMeta[], config: Config) {
  const filteredComponents = getFilteredComponents(outputTarget.excludeComponents, components);
  const rootDir = config.rootDir as string;

  await generateProxies(compilerCtx, filteredComponents, outputTarget, rootDir);
  await copyResources(config, outputTarget);
}

function getFilteredComponents(excludeComponents: string[] = [], cmps: ComponentCompilerMeta[]) {
  return sortBy(cmps, cmp => cmp.tagName)
    .filter(c => !excludeComponents.includes(c.tagName) && !c.internal);
}

async function generateProxies(compilerCtx: CompilerCtx, components: ComponentCompilerMeta[], outputTarget: OutputTargetReact, rootDir: string) {
  const pkgData = await readPackageJson(rootDir);
  const distTypesDir = path.dirname(pkgData.types);
  const dtsFilePath = path.join(rootDir, distTypesDir, GENERATED_DTS);
  const componentsTypeFile = relativeImport(outputTarget.proxiesFile, dtsFilePath, '.d.ts');

  const imports = `/* tslint:disable */
/* auto-generated react proxies */
import { createReactComponent } from './createComponent';\n`;

  const typeImports = !outputTarget.componentCorePackage ?
    `import { ${IMPORT_TYPES} } from '${componentsTypeFile}';\n` :
    `import { ${IMPORT_TYPES} } from '${outputTarget.componentCorePackage}';\n`;

  const importList = components.map(cmpMeta => {
    const tagNameAsPascal = dashToPascalCase(cmpMeta.tagName);
    return `  ${tagNameAsPascal} as Import${tagNameAsPascal}`;
  }).join(',\n');

  const sourceImports = `import {\n${importList}\n// @ts-ignore\n} from '${path.join(outputTarget.componentCorePackage || '', outputTarget.modulesDir || '')}';\n`;

  const final: string[] = [
    imports,
    typeImports,
    sourceImports,
    components.map(createComponentDefinition).join('\n')
  ];

  const finalText = final.join('\n') + '\n';

  return compilerCtx.fs.writeFile(outputTarget.proxiesFile, finalText);
}

function createComponentDefinition(cmpMeta: ComponentCompilerMeta) {
  const tagNameAsPascal = dashToPascalCase(cmpMeta.tagName);

  return [
    `export const ${tagNameAsPascal} = /* #__PURE__ */createReactComponent<${IMPORT_TYPES}.${tagNameAsPascal}, HTML${tagNameAsPascal}Element>(window, '${cmpMeta.tagName}', Import${tagNameAsPascal});`
  ];
}

function copyResources(config: Config, outputTarget: OutputTargetReact) {
  const directory = path.dirname(outputTarget.proxiesFile);
  const resourcesFilesToCopy = [
    'utils.ts',
    'createComponent.tsx'
  ];
  if (!config.sys || !config.sys.copy) {
    throw new Error('stencil is not properly intialized at this step. Notify the developer');
  }

  return config.sys.copy(
    resourcesFilesToCopy.map(rf => ({
      src: path.join(__dirname, '../src/resources/', rf),
      dest: path.join(directory, rf),
      warn: false
    }))
  );
}

export const GENERATED_DTS = 'components.d.ts';
const IMPORT_TYPES = 'JSX';