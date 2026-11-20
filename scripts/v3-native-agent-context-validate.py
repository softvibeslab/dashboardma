"""Offline operator plan validation. No inference, discovery, service start or RBAC writes."""
import argparse
import importlib.util
import json
import os
import re
from pathlib import Path
import tempfile


def validate(manifest_file,bindings_file):
    for path,max_bytes in ((manifest_file,1000000),(bindings_file,96000)):
        info=path.lstat()
        if path.is_symlink() or not path.is_file() or info.st_mode&0o077 or info.st_size>max_bytes:
            raise ValueError('operator-file-permissions-or-size')
    spec=importlib.util.spec_from_file_location('context_broker',Path(__file__).with_name('v3-hermes-agent-broker.py'))
    assert spec is not None and spec.loader is not None
    broker=importlib.util.module_from_spec(spec);spec.loader.exec_module(broker)
    manifest=json.loads(manifest_file.read_text());bindings=json.loads(bindings_file.read_text())
    with tempfile.TemporaryDirectory(prefix='native-context-validation-',dir=os.environ.get('TMPDIR','/root/.hermes/cache/scratch')) as directory:
        service=broker.Broker(Path(directory),manifest)
        try:
            valid=isinstance(bindings,list) and all(isinstance(b,dict) and set(b)=={'actor','org','project','caseId','sourceHash'} and broker.scope_valid({k:b[k] for k in ('actor','org','project','caseId')}) and isinstance(b['sourceHash'],str) and re.fullmatch('[a-f0-9]{64}',b['sourceHash']) for b in bindings)
            if not valid:raise ValueError('bindings-invalid')
            if len({(b['actor'],b['sourceHash']) for b in bindings})!=len(bindings):raise ValueError('bindings-ambiguous')
            match=broker.binding_set_hash(bindings)==broker.binding_set_hash(manifest['grants'])
            result={'contextPlanValid':match and service.context_ready(),'bindingsMatch':match,'coverage':service.coverage(),'bindingsHash':broker.binding_set_hash(bindings),'runtimeReadinessVerified':False,'providerRequests':0}
            result['gate']='context-plan-valid-runtime-still-required' if result['contextPlanValid'] else 'bindings-mismatch' if not match else 'unindexed-or-over-budget-bindings'
            return result
        finally:service.db.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--manifest',type=Path,required=True);parser.add_argument('--bindings',type=Path,required=True);args=parser.parse_args()
    try:result=validate(args.manifest,args.bindings)
    except Exception as exc:
        safe={'operator-file-permissions-or-size','manifest-invalid','manifest-limit','source-invalid','source-sensitive-or-unversioned','bindings-invalid','bindings-ambiguous'}
        result={'contextPlanValid':False,'gate':str(exc) if str(exc) in safe else 'context-plan-unreadable-or-invalid','runtimeReadinessVerified':False,'providerRequests':0}
    print(json.dumps(result,indent=2));return 0 if result['contextPlanValid'] else 3


if __name__=='__main__':raise SystemExit(main())
