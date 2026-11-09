(module
  (memory (export "memory") 1)
  (func (export "score") (param $n i32) (param $classes i32) (param $prior f32)
    (local $c i32) (local $i i32) (local $sum f32)
    (block $done (loop $class
      (br_if $done (i32.ge_u (local.get $c) (local.get $classes)))
      (local.set $i (i32.const 0))
      (local.set $sum (local.get $prior))
      (block $end (loop $feature
        (br_if $end (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $sum (f32.add (local.get $sum)
          (f32.mul
            (f32.load (i32.mul (local.get $i) (i32.const 4)))
            (f32.load (i32.mul (i32.add (local.get $n) (i32.add (i32.mul (local.get $c) (local.get $n)) (local.get $i))) (i32.const 4))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $feature)))
      (f32.store (i32.mul (i32.add (i32.mul (local.get $n) (i32.add (local.get $classes) (i32.const 1))) (local.get $c)) (i32.const 4)) (local.get $sum))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br $class))))
)
