
/**
 * @file A state object which allows properties to be linked to listeners. It also supports a dependency tree between
 * the different properties, allowing the user to ensure that certain updates are handled before others and reduntant 
 * updates aren't made. 
 * 
 * @author Lee Mason <masonlk@nih.gov>
 */
export class State {
  
  constructor() {
    this.properties = {}
    this.listeners = new Map()
    this.dependencyTree = new Tree()

    //this.updatePropertyStack = new Set()
    //this.updateScheduled = false
    this.scheduled = new Set()
  }


  defineProperty(property, value, parentProperties) {
    //if (!this.hasOwnProperty(property)) {
      Object.defineProperty(this, property, {
        set: function(value) { this._setProperty(property, value) },
        get: function() { return this.properties[property] }
      })
      this.properties[property] = value
    //}
    this.dependencyTree.addNode(property, {listeners: [], parents: parentProperties}, parentProperties)
  }

  defineJointProperty(name, properties) {
    this.defineProperty(name, null, properties)
    
    const listener = () => {
      const obj = {}
      for (const property of properties) {
        obj[property] = this.properties[property]
      }
      this[name] = obj 
    }
    for (const property of properties) {
      this.subscribe(property, listener)
    }
    this.subscribe(name, listener)
  }

  linkProperties(childProperty, parentProperties) {
    if (!Array.isArray(parentProperties)) {
      parentProperties = [parentProperties]
    }

    const childNode = this.dependencyTree.getNode(childProperty)
    for (const parentProperty of parentProperties) {
      //console.log(childProperty, parentProperty, this.dependencyTree.getNode(parentProperty))
      const parentNode = this.dependencyTree.getNode(parentProperty)
      parentNode.children.set(childProperty, childNode)
    }
  }

  subscribe(property, f) {
    this.dependencyTree.getNode(property).content.listeners.push(f)
  }

  trigger(property) {
    this._setProperty(property, this.properties[property])
  }

  hasProperty(property) {
    return this.properties.hasOwnProperty(property)
  }

  _setProperty(property, value) {
    this.properties[property] = value 

    if (!this.scheduled.has(property)) {
      let listenerQueue = this.dependencyTree.getAllNodes(property)
      listenerQueue = listenerQueue.filter(node => !this.scheduled.has(node.key))
      listenerQueue.forEach(node => this.scheduled.add(node.key))
      this.runListenerQueue(listenerQueue)
    } else {
      // TODO: Fix this whole non-sense
      const scheduledJob = this.dependencyTree.getNode(property)
    }
  }

  async runListenerQueue(listenerQueue) {
    try { 
      for (const node of listenerQueue) {
        for (const listener of node.content.listeners) {
          await listener(this.properties[node.key], node.key)
        }
      }
    } finally {
      listenerQueue.forEach(node => this.scheduled.delete(node.key))
    }
  }
}

class Node {
  constructor(key, content) {
    this.key = key 
    this.content = content 
    this.children = new Map() 
  }
}

class Tree {
  constructor() {
    this.nodes = new Map()
  }
  
  addNode(key, content, parents=[]) {
    if (this.nodes.has(key)) {
      throw new Error("Node already exists")
    }

    if (!Array.isArray(parents)) {
      parents = [parents]
    }

    const node = new Node(key, content)
    this.nodes.set(key, node)
    
    for (const parent of parents) {
      if (!this.nodes.has(key)) {
        throw new Error("Parent node doesn't exist")
      }

      this.nodes.get(parent).children.set(key, node)
    }

    this.trimTree()
  }
  
  getNode(key) {
    return this.nodes.get(key)
  }

  getAllNodes(key) {
    return this.breadthFirstSearch(this.getNode(key))
  }

  breadthFirstSearch(root) {
    let visitedSet = new Set()
    let visited = []
    let queue = []
  
    queue.push(root)
  
    while (queue.length > 0) {
      let currentNode = queue.shift()

      if (!visitedSet.has(currentNode.key)) {
        visitedSet.add(currentNode.key)
        visited.push(currentNode.key)

        currentNode.children.forEach(child => {
          queue.push(child)
        })
      }
      
    }
  
    return visited.map(d => this.nodes.get(d))
  }

  trimTree() {
    // This is inefficient, e.g. we could improve by tracking root nodes.
    for (const node of this.nodes.values()) {
      this.trimNodePaths(node)
    }
  }

  trimNodePaths(node) {
    let visited = new Map(); // Map to store visited nodes to avoid cycles
  
    // Helper function to find all super-paths for a given node
    function findAllSuperPaths(currentNode, visited) {
      visited.set(currentNode.key, true);
      let childrenKeys = Array.from(currentNode.children.keys());
  
      // If no children or all children visited, it's the end of a path
      if (childrenKeys.length === 0 || childrenKeys.every(key => visited.has(key))) {
        return [[currentNode.key]];
      }
  
      // Find all paths for children
      let paths = [];
      for (let childKey of childrenKeys) {
        if (!visited.has(childKey)) {
          let childPaths = findAllSuperPaths(currentNode.children.get(childKey), new Map(visited));
          for (let path of childPaths) {
            paths.push([currentNode.key].concat(path));
          }
        }
      }
      return paths;
    }
  
    // Helper function to remove direct relationships with valid super-paths
    function removeDirectRelationships(node, superPaths) {
      for (let childKey of node.children.keys()) {
        let shouldBeRemoved = superPaths.some(path => {
          let index = path.indexOf(node.key);
          return index !== -1 && path.indexOf(childKey) > index + 1;
        });
  
        if (shouldBeRemoved) {
          node.children.delete(childKey);
        }
      }
    }
  
    // Find all the super-paths for the given node
    let superPaths = findAllSuperPaths(node, visited);
    // Remove direct relationships that have a longer super-path
    removeDirectRelationships(node, superPaths);
  
    // For simplicity, this implementation doesn't remove nodes that have become leaves
    // because of the removal but are not end nodes of any super-path. 
  }
}