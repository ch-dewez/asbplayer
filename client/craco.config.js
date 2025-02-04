// const fs = require('fs');
// const path = require('path');
// const appDirectory = fs.realpathSync(process.cwd());
// const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);



// // create-react-app scripts don't work with typescript projects linked by yarn out-of-the-box
// // https://stackoverflow.com/questions/65893787/create-react-app-with-typescript-and-npm-link-enums-causing-module-parse-failed
// module.exports = {
//     webpack: {
//         configure: (webpackConfig) => ({
//             ...webpackConfig,
//             module: {
//                 ...webpackConfig.module,
//                 rules: webpackConfig.module.rules.map((rule) => {
//                     if (!rule.oneOf) return rule;
//                     return {
//                         ...rule,
//                         oneOf: rule.oneOf.map((ruleObject) => {
//                             if (!new RegExp(ruleObject.test).test('.ts') || !ruleObject.include) return ruleObject;
//                             return {
//                                 ...ruleObject,
//                                 include: [resolveApp('src'), resolveApp('../common')],
//                             };
//                         })
//                     };
//                 }),
//             },
//         }),
//     },
// };

const fs = require("fs");
const path = require("path");
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      //
      // 1) Make sure Webpack knows about ".cjs" extension
      //
      if (!webpackConfig.resolve.extensions.includes(".cjs")) {
        webpackConfig.resolve.extensions.push(".cjs");
      }

      //
      // 2) Add a rule for .cjs files using babel-loader
      //
      // NOTE: "type: 'javascript/auto'" is often necessary so Webpack
      //       doesn't interpret .cjs as JSON or other formats.
      //
      webpackConfig.module.rules.push({
        test: /\.cjs$/,
        type: "javascript/auto",
        // If your .cjs file is inside `node_modules`, you might need to remove
        // the exclude or use a more precise exclude. Try removing it entirely if
        // you need to transpile from node_modules.
        exclude: /@babel(?:\/|\\{1,2})runtime/,
        use: {
          loader: require.resolve("babel-loader"),
          options: {
            babelrc: false,
            configFile: false,
            compact: false,
            presets: [
              [
                require.resolve("babel-preset-react-app/dependencies"),
                { helpers: true },
              ],
            ],
            cacheDirectory: true,
            cacheCompression: false,
            sourceMaps: true,
            inputSourceMap: true,
          },
        },
      });

      //
      // 3) Update the existing "ts" loader rule to include extra folder(s)
      //
      webpackConfig.module.rules = webpackConfig.module.rules.map((rule) => {
        if (!rule.oneOf) {
          return rule;
        }
        return {
          ...rule,
          oneOf: rule.oneOf.map((ruleObject) => {
            // Check if the rule is for TS/TSX by verifying its "test" property
            if (!ruleObject.test || !new RegExp(ruleObject.test).test(".ts")) {
              return ruleObject;
            }
            // If there's no `include`, skip
            if (!ruleObject.include) {
              return ruleObject;
            }

            return {
              ...ruleObject,
              include: [
                resolveApp("src"),
                resolveApp("../common"), // or wherever you need
              ],
            };
          }),
        };
      });

      return webpackConfig;
    },
  },
};
